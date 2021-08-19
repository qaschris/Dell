const PulseSdk = require('@qasymphony/pulse-sdk');
const request = require('request');
const xml2js = require('xml2js');
const { Webhooks } = require('@qasymphony/pulse-sdk');

/* Expected Payload:
{
  "event_timestamp": 1627935744578,
  "event_type": "testcase_updated",
  "testcase": {
    "id": 2557716,
    "project_id": 12465,
    "testcase_version": "2.0",
    "testcase_versionid": 4068220
  }
}
*/

// Begin Configuration

let parentProject = 12465;

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
			var field;
            var updatedTestCase;
            var updatedTestCaseSteps = [];
            testName = '';
            testRunSteps = [];
			properties = [];
            fieldValueName = [];
            var requestChildTestCase;

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
                    console.log('[DEBUG]: ' + JSON.stringify(testCase));

                    testName = testCase.name;

                    for (c = 0; c < testCase.test_steps.length; c++) {
                        testStep = {
                            order: testCase.test_steps[c].order,
                            description: testCase.test_steps[c].description,
                            expected: testCase.test_steps[c].expected
                        };
                        testRunSteps.push(testStep);
                    }
					
                
					for (f = 0; f < testCase.properties.length; f++) {
                        if(testCase.properties[f].field_name == "ODM Vendors"){
                            fieldValueName = testCase.properties[f].field_value_name;
                        }
                    }
                    //fieldValueName array is not used currently
                    console.log('[DEBUG]: Fields (in function): ' + JSON.stringify(fieldValueName));
                    
                    //I am only using 1 child project. Needs to be updated to be dynamic
                    var childProjectId = 5304;
                    //Request to get ChildProject testcase fields
                    var optsFields = {
                        url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + childProjectId + '/settings/test-cases/fields',
                        json: true,
                        headers: standardHeaders
                    };

                    await request.get(optsFields, async function(err, response, resbodyFields) {
                        if (err) {
                            reject();
                            console.log('[ERROR]: ' + err);
                            process.exit(1);
                            return;
                        } else {
                            resolve();
                            console.log('[INFO]: Get Fields: ' + JSON.stringify(resbodyFields));
                           
                        var fieldValueName;
                        console.log('[DEBUG]: No of fields: ' + resbodyFields.length);
                        //Loop to update field id and values to create a request to create testcase
                        for (f = 0; f < resbodyFields.length; f++) {
                            console.log('[DEBUG]: field label?: '+ resbodyFields[f].label);
                            let tcAutomationStatus = testCase.properties.find(obj => obj.field_name == resbodyFields[f].label);
                            console.log('[DEBUG]: Automatedvalue: ' + tcAutomationStatus.field_value);
                            console.log('[DEBUG]: Automatedname: ' + tcAutomationStatus.field_value_name);
                            console.log('[DEBUG]: Automatedid: ' + tcAutomationStatus.field_id);
                            
                            field = {
                                field_id: resbodyFields[f].id,
                                field_name: resbodyFields[f].label,
                                field_value: tcAutomationStatus.field_value,
                                field_value_name: tcAutomationStatus.field_value_name
                                }
                                properties.push(field);
                            }
                            
                        //Setup request for create testcase
                        requestChildTestCase = {
                            name: testName,
                            properties: properties,
                            test_steps: testRunSteps
                        }

                        //Creating Testcase in only one of the child project for now.                   
                        createTestCase(5304, requestChildTestCase);
                        }
                       
                    })
            
                    //await searchForModule(testCase.parent_id);
                    Promise.resolve('Test case checked successfully.');

                    resolve();
                }
        
            });
        });
    };

    const createTestCase = async(projectId, createdTestCase) => {
        await new Promise(async(resolve, reject) => {
            console.log('[DEBUG]: Updating Test Case Body: ' + JSON.stringify(createdTestCase));

            var standardHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${constants.QTEST_TOKEN}`
            }

            var opts = {
                url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + projectId + '/test-cases',
                json: true,
                headers: standardHeaders,
                body: createdTestCase
            };

            await request.post(opts, async function(err, response, resbody) {
                if (err) {
                    reject();
                    console.log('[ERROR]: ' + err);
                    process.exit(1);
                    return;
                } else {
                    resolve();
                    console.log('[INFO]: Test Case Updated: ' + JSON.stringify(resbody));
                    return;
                }
            })
        })
    }

    //I didn't know how to return response body to main method above. This needs to be looked at next week
    const getTestCaseFields = async(projectId) => {
        await new Promise(async(resolve, reject) => {

            var standardHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${constants.QTEST_TOKEN}`
            }

            var opts = {
                url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + projectId + '/settings/test-cases/fields',
                json: true,
                headers: standardHeaders
            };

            await request.get(opts, async function(err, response, resbody) {
                if (err) {
                    reject();
                    console.log('[ERROR]: ' + err);
                    process.exit(1);
                    return;
                } else {
                    resolve();
                    console.log('[INFO]: Test Case Updated: ' + JSON.stringify(resbody));
                    return resbody;
                }
            })
        })
    }

    //This method is not used for now
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
