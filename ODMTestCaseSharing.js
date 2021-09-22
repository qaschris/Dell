const request = require('request');
const { Webhooks } = require('@qasymphony/pulse-sdk');

/* Expected Payload:
{
  "event_timestamp": 1627935744578,
  "event_type": "testcase_updated",
  "testcase": {
    "id": 52082043,
    "project_id": 74528,
    "testcase_version": "1.0",
    "testcase_versionid": 4068220
  }
}
*/

// Begin Configuration

let parentProject = 74528;

// End Configuration

let suiteName = [];
let qTestProjects = [];
let childProjectId;
let childProject;

exports.handler = async function ({ event: body, constants, triggers }, context, callback) {    
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    };

    const searchForProjects = async() => {
        await new Promise(async(resolve, reject) => {
            var standardHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${constants.QTEST_TOKEN}`
            };

            var opts = {
                'url': 'https://' + constants.ManagerURL + '/api/v3/projects',
                'json': true,
                'headers': standardHeaders
            };

            await request.get(opts, async function(err, response, resbody) {
                if (err) {
                    console.log('[ERROR]: ' + err);
                    reject();
                } else if (response.statusCode !== 200) {
                    console.log('[ERROR]: Response: ' + JSON.stringify(response.body) + ', Projects not found.');
                    reject();
                } else {
                    console.log('[DEBUG]: Projects returned for all ODM Vendors: ' + JSON.stringify(resbody));
                    for(p = 0; p < resbody.length; p++) {
                        let projectPair = {
                            name: resbody[p].name,
                            id: resbody[p].id
                        };
                        qTestProjects.push(projectPair);
                    }
                    console.log('[DEBUG]: Project IDs: ' + JSON.stringify(qTestProjects));
                    resolve();
                };
            });
        })
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
            let fieldValueName;
            var requestChildTestCase;
            var version;

            console.log('[INFO]: Checking for Parent Test Case ID: ' + id);
            await request(opts, async function(err, response, resbody) {
                if (err) {
                    console.log('[ERROR]: ' + err);
                    reject();
                } else if (response.statusCode !== 200) {
                    console.log('[ERROR]: Response: ' + JSON.stringify(response.body) + '; Test Case not found.');
                    reject();
                } else {
                    testCase = resbody;
                    console.log('[INFO]: Parent Test Case checked for id: ' + id + ', found ' + testCase.test_steps.length + ' steps.');
                    console.log('[DEBUG]: ' + JSON.stringify(testCase));

                    testName = testCase.name;
                    version = testCase.version;

                    for (c = 0; c < testCase.test_steps.length; c++) {
                        testStep = {
                            order: testCase.test_steps[c].order,
                            description: testCase.test_steps[c].description,
                            expected: testCase.test_steps[c].expected
                        };
                        testRunSteps.push(testStep);
                    }
                    
                    // Select list of ODM vendors 
                    for (f = 0; f < testCase.properties.length; f++) {
                        if(testCase.properties[f].field_name == "ODM Vendors"){
                            fieldValueName = testCase.properties[f].field_value_name.substring(1, testCase.properties[f].field_value_name.length - 1).split(', ');
                        }
                    }

                    // Check the parent test case for ODM Venders, and match the name to the Projects to get the collection of IDs
                    console.log('[INFO]: ' + fieldValueName.length + ' ODM Vendors Selected in Parent Test Case: ' + JSON.stringify(fieldValueName));

                    for (v = 0; v < fieldValueName.length; v++) {
                        childProject = qTestProjects.find(obj => obj.name == fieldValueName[v]);
                        childProjectId = childProject.id;
                        console.log('[INFO]: Found Projects: ' + JSON.stringify(childProjectId));

                        //Request to get ChildProject testcase fields
                        var optsFields = {
                            url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + childProjectId + '/settings/test-cases/fields',
                            json: true,
                            headers: standardHeaders
                        };

                        await request.get(optsFields, async function(err, response, resbodyFields) {
                            if (err) {
                                console.log('[ERROR]: ' + err);
                                reject();
                            } else {
                                console.log('[INFO]: Get Fields: ' + JSON.stringify(resbodyFields));
                               
                                console.log('[DEBUG]: No of fields: ' + resbodyFields.length);
                                //Loop to update field id and values to create a request to create testcase
                                for (f = 0; f < resbodyFields.length; f++) {
                                    console.log('[DEBUG]: Field label: '+ resbodyFields[f].label);
                                    // If test case sharing is enabled in qTest, we want to ignore this field, and also skip Parent ID to handle later
                                    if (resbodyFields[f].label !== 'Shared' && resbodyFields[f].label !== 'Parent ID') {
                                        let tcAutomationStatus = testCase.properties.find(obj => obj.field_name == resbodyFields[f].label);
                                        console.log('[DEBUG]: Field value: ' + tcAutomationStatus.field_value);
                                        console.log('[DEBUG]: Field name: ' + tcAutomationStatus.field_value_name);
                                        console.log('[DEBUG]: Field id: ' + tcAutomationStatus.field_id);
                                        
                                        field = {
                                            field_id: resbodyFields[f].id,
                                            field_name: resbodyFields[f].label,
                                            field_value: tcAutomationStatus.field_value,
                                            field_value_name: tcAutomationStatus.field_value_name
                                        };
                                        properties.push(field);
                                    }
                                    // And we're handling Parent ID now
                                    if(resbodyFields[f].label == 'Parent ID'){
                                        field = {
                                            field_id: resbodyFields[f].id,
                                            field_name: resbodyFields[f].label,
                                            field_value: testCase.pid
                                        }
                                        properties.push(field);
                                    }
                                }
                                // Setup request for create testcase
                                requestChildTestCase = {
                                    name: testName,
                                    properties: properties,
                                    test_steps: testRunSteps
                                }

                                // Creating Testcase in the child project    
                                if (version == 1.0) {
                                    await createTestCase(childProjectId, requestChildTestCase);
                                }
                                else if (version >= 2.0) {
                                    var searchForTestCasePayload = {
                                        object_type: "test-cases",
                                        fields: ["*"],
                                        query: "'Parent ID' = '" + testCase.pid + "'"
                                    }

                                    //Search for the Testcase
                                    var searchHeaders = {
                                        'Content-Type': 'application/json',
                                        'Authorization': `bearer ${constants.QTEST_TOKEN}`,
                                        'pageSize': 50,
                                        'page': 1
                                    }
                                    var optsSearch = {
                                        url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + childProjectId + '/search',
                                        json: true,
                                        headers: searchHeaders,
                                        body: searchForTestCasePayload
                                    };
                                     
                                    console.log('[INFO]: Request Search Results: ' + JSON.stringify(optsSearch));
                                    await request.post(optsSearch, async function(err, response, resbodySearch) {
                                        if (err) {
                                            console.log('[ERROR]: ' + err);
                                            reject();
                                        } else {
                                            console.log('[INFO]: Get Search Results: ' + JSON.stringify(resbodySearch));

                                            if(resbodySearch.items.length >= 1){
                                                var childTestCaseId = resbodySearch.items[0].id;
                                                await updateTestCase(childTestCaseId, childProjectId, requestChildTestCase);
                                            }
                                            resolve();
                                        }
                                    });

                                resolve();
                                }
                            }
                        });
                    }            
                    //Promise.resolve('Test case checked successfully.');
                }
        
            });
        });
    };

    const createTestCase = async(projectId, createdTestCase) => {
        await new Promise(async(resolve, reject) => {
            console.log('[DEBUG]: Updating Project Id: ' + projectId);
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
                    console.log('[ERROR]: ' + err);
                    reject();
                } else {
                    console.log('[INFO]: Test Case Created: ' + JSON.stringify(resbody));
                    resolve();
                }
            });
            resolve();
        });
    }

    const updateTestCase = async(testCaseId, projectId, updatedTestCase) => {
        await new Promise(async(resolve, reject) => {
            console.log('[DEBUG]: Updating Project Id: ' + projectId);
            console.log('[DEBUG]: Updating Test Case Id: ' + testCaseId);
            console.log('[DEBUG]: Updating Test Case Body: ' + JSON.stringify(updatedTestCase));

            var standardHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${constants.QTEST_TOKEN}`
            }

            var opts = {
                url: 'https://' + constants.ManagerURL + '/api/v3/projects/' + projectId + '/test-cases/' + testCaseId,
                json: true,
                headers: standardHeaders,
                body: updatedTestCase
            };

            await request.put(opts, async function(err, response, resbody) {
                if (err) {
                    console.log('[ERROR]: ' + err);
                    reject();
                } else {
                    console.log('[INFO]: Test Case Updated: ' + JSON.stringify(resbody));
                    resolve();
                }
            });
            resolve();
        });
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
                    console.log('[ERROR]: ' + err);
                    reject();
                } else {
                    console.log('[INFO]: Test Case Updated: ' + JSON.stringify(resbody));
                    resolve();
                    return resbody;
                }
            });
            resolve();
        });
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
            });
            resolve();
        });
    }
    
    let payload = body;
    
    if (payload.testcase.project_id == parentProject) {
        console.log('[INFO]: Project ID ' + payload.testcase.project_id + ' is the configured Parent Project.')
        let testcaseVersion = payload.testcase.testcase_version.split('.');
        if ( testcaseVersion[1] == 0 ) {
            console.log('[INFO]: Test case iterative version ' + testcaseVersion[1] + ' indicates approval and is required for processing.')
            console.log('[INFO]: About to collect Project information...');
            await searchForProjects();
            if ( testcaseVersion[0] == 1) {
                console.log('[INFO]: Test case created event!');
                // retrieve original parent test case
                await searchForTestCase(payload.testcase.id);
            } else {
                console.log('[INFO]: Test case updated event!');
                await searchForTestCase(payload.testcase.id);
            }

        } else {
            console.log('[INFO]: Test case iterative version ' + testcaseVersion[1] + ' is not required for processing.')
        }
    } else {
        console.log('[INFO]: Project ID ' + payload.testcase.project_id + ' is the not configured Parent Project.')
        //do nothing with it
    }
}
