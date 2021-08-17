const PulseSdk = require('@qasymphony/pulse-sdk');
const request = require('request');
const xml2js = require('xml2js');
const { Webhooks } = require('@qasymphony/pulse-sdk');

/* Expected Payload:
{
  "event_timestamp": 1627935744578,
  "event_type": "testcase_updated",
  "testcase": {
    "id": 51447115,
    "project_id": 74528,
    "testcase_version": "1.0",
    "testcase_versionid": 74599170
  }
}
*/

// Begin Configuration

let parentProject = 74528;

// End Configuration

let suiteName = [];

exports.handler = async function ({ event: body, constants, triggers }, context, callback) {    
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }

    const searchForTestCase = async(id) => {
        await new Promise(async(resolve, reject) => {
            var standardHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${constants.QTEST_TOKEN}`
            }

            var opts = {
                url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + parentProject + '/test-cases/' + id,
                json: true,
                headers: standardHeaders
            };

            var testCase;
            var testStep;
            var updatedTestCase;
            var updatedTestCaseSteps = [];
            testName = '';
            testRunSteps = [];

            await request(opts, async function(err, response, resbody) {
                if (err) {
                    console.log('[ERROR]: ' + err);
                    reject();
                    return;
                } else if (response.statusCode !== 200) {
                    console.log('[ERROR]: Response: ' + JSON.stringify(response.body) + '; Test Case not found, check the Test Case IDs in the TestNG result file.');
                    reject();
                    return;
                } else {
                    testCase = resbody;
                    console.log('[INFO]: Test Cases checked for id: ' + id + ', found ' + testCase.test_steps.length + ' steps.');
                    //console.log('[DEBUG]: ' + JSON.stringify(testCase));

                    testName = testCase.name;

                    for (c = 0; c < testCase.test_steps.length; c++) {
                        testStep = {
                            order: testCase.test_steps[c].order,
                            description: testCase.test_steps[c].description,
                            expected_result: testCase.test_steps[c].expected
                        };
                        testRunSteps.push(testStep);
                    }

                    //console.log('[DEBUG]: Test Steps (in function): ' + JSON.stringify(testRunSteps));

                    let tcAutomationStatus = testCase.properties.find(obj => obj.field_name == 'Automation');
                    console.log('[DEBUG]: Automated?: ' + tcAutomationStatus.field_value_name);
                    let tcAutomationContent = testCase.properties.find(obj => obj.field_name == 'Automation Content');
                    console.log('[DEBUG]: Automation Content: ' + tcAutomationContent.field_value);

                    await searchForModule(testCase.parent_id);

                    if (tcAutomationStatus.field_value_name == 'No') {
                        for (c = 0; c < testCase.test_steps.length; c++) {
                            testStep = {
                                order: testCase.test_steps[c].order,
                                description: testCase.test_steps[c].description,
                                expected: testCase.test_steps[c].expected
                            };
                            updatedTestCaseSteps.push(testStep);
                        }

                        updatedTestCase = {
                            name: testName,
                            properties: [
                                {
                                  field_id: tcAutomationStatus.field_id,
                                  field_value: 711,
                                },                                
                                {
                                  field_id: tcAutomationContent.field_id,
                                  field_value: className,
                                }
                            ],
                            test_steps: updatedTestCaseSteps
                        }

                        //await updateTestCase(id, updatedTestCase);
                    }

                    Promise.resolve('Test case checked successfully.');

                    resolve();
                }
            });
        });
    };

    const searchForModule = async(id) => {
        await new Promise(async(resolve, reject) => {
            var standardHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${constants.QTEST_TOKEN}`
            }

            var opts = {
                url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + parentProject + '/modules/' + id,
                json: true,
                headers: standardHeaders
            };

            await request(opts, async function(err, response, resbody) {
                if (err) {
                    console.log('[ERROR]: ' + err);
                    reject();
                } else {
                    suiteName.push(resbody.name);

                    if (resbody.links.length > 1) {
                        console.log('[DEBUG]: ' + JSON.stringify(resbody.links[1].href.split('/')));
                        await searchForModule(resbody.links[1].href.split('/')[8]);
                    }

                    resolve();
                }
            })
        });
    }
    
    let payload = body;
    
    if (payload.testcase.project_id == parentProject) {
        console.log('[INFO]: Project ID ' + payload.testcase.project_id + ' is the configured Parent Project.')
        let testcaseVersion = payload.testcase.testcase_version.split('.');
        if ( testcaseVersion[1] == 0 ) {
            console.log('[INFO]: Test case iterative version ' + testcaseVersion[1] + ' is required for processing.')
            if ( testcaseVersion[0] == 1) {
                console.log('[INFO]: Test case created event!');
                // retrieve original parent test case
                searchForTestCase(payload.testcase.id);
            } else {
                console.log('[INFO]: Test case updated event!');
                searchForTestCase(payload.testcase.id);
            }

        } else {
            console.log('[INFO]: Test case iterative version ' + testcaseVersion[1] + ' is not required for processing.')
        }
    } else {
        console.log('[INFO]: Project ID ' + payload.testcase.project_id + ' is the not configured Parent Project.')
        //do nothing with it
    }


}
