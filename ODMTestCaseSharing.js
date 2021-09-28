const request = require('request');
//const { Webhooks } = require('@qasymphony/pulse-sdk');

/* Expected Payload:
{
  "event_timestamp": 1627935744578,
  "event_type": "testcase_updated",
  "testcase": {
    "id": 52082043,
    "project_id": 74528,
    "testcase_version": "3.0",
    "testcase_versionid": 4068220
  }
}
*/

/* Expected Constants:
ManagerURL: The base URL domain name of the qTest instance, e.g. demo.qtestnet.com
QTEST_TOKEN: The Bearer token for the qTest service account user with all necessary project access
ParentProjectId: The ID of the parent project, acquired from the qTest Manager URL or API
ODMVendorFieldName: Case sensitive - The name of the field used for the ODM Vendor child project selections
ParentTestCaseFieldName: Case sensitive - The name of the site field used to store the parent test case ID in the child projects
*/

exports.handler = async function ({ event: body, constants, triggers }, context, callback) {    
    const payload = body;

    const searchForParentTestCase = async(testcaseID, ParentProjectId) => {
        return await new Promise(async(resolve, reject) => {
            var options = {
            'method': 'GET',
            'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ParentProjectId+'/test-cases/'+testcaseID,
            'headers': {
                'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                'Accept-Type': 'application/json',
                'Content-Type': 'application/json'
            }
            };
            request(options, function (error, response) {
                if (error) {
                    return reject(error);
                } else {
                    return resolve(response.body);
                }
            });

        });
    };

    const createORupdateTestCase = async(childProjectId, testcasePayload, testCaseId) => {
        return await new Promise(async(resolve, reject) => {
            var options = {
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+childProjectId+'/test-cases/',
                'headers': {
                'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                'Accept-Type': 'application/json',
                'Content-Type': 'application/json'
                },
                body: JSON.stringify(testcasePayload)
            };
            if (testCaseId == 0) {
                options.method = 'POST';
            } else {
                options.method = 'PUT';
                options.url = options.url+testCaseId;
            }
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR]: '+ error);
                    return reject(error);
                } else {
                    console.log('[INFO]: '+ response.body);
                    return resolve(response.body);
                }
            });
        });
    }

    const checkIfChildTestCaseExists = async(childProjectId, qTestParentTestCasePID) => {
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'POST',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+childProjectId+'/search',
                'headers': {
                'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                'Accept-Type': 'application/json',
                'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "object_type": "test-cases",
                    "fields": [
                        "id"
                    ],
                    "query": "'"+constants.ParentTestCaseFieldName+"' = '"+qTestParentTestCasePID+"'"
                })
            
            };
            request(options, function (error, response) {
                if (error) {
                    return reject(error);
                } else {
                    return resolve(response.body);
                }
            });
        });
    }

    const searchForProjects = async() => {
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'GET',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects',
                'headers': {
                'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                'Accept-Type': 'application/json',
                'Content-Type': 'application/json',
                }
            };
            request(options, async (error, response) => {
                if (error) {
                    return reject(error);
                } else {
                    return resolve(response.body);
                }
            });
        });
    }

    const getChildTestCaseFieldValues = async(ChildProjectId) => {
        return await new Promise(async(resolve, reject) => {        
            var options = {
                'method': 'GET',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ChildProjectId+'/settings/test-cases/fields',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'Accept-Type': 'application/json',
                    'Content-Type': 'application/json'
                }
            };
            request(options, function (error, response) {
                if (error) {
                    return reject(error);
                } else {
                    return resolve(response.body);
                }
            });
        });
    }

    
    if (payload.testcase.project_id == constants.ParentProjectId) {
        console.log('[INFO]: Project ID ' + payload.testcase.project_id + ' is the configured Parent Project.');
        const testcaseVersion = payload.testcase.testcase_version.split('.');
        const qTestParentTestCaseID = payload.testcase.id;
        if(testcaseVersion[1] == 0) {
            console.log('[INFO]: Test case iterative version ' + testcaseVersion[1] + ' indicates approval and is required for processing.')
            console.log('[INFO]: About to collect Project information...');
            let qTestProjectListArray = [];
            await searchForProjects().then((array) => {
                qTestProjectListArray = JSON.parse(array);
                console.log('[INFO]: '+qTestProjectListArray.length+' projects found.');
            }).catch((error) => {
                console.log(error);
            })
            let qTestParentTestCaseObject = {};
            await searchForParentTestCase(qTestParentTestCaseID, constants.ParentProjectId).then((object) => {
                qTestParentTestCaseObject = JSON.parse(object);
            }).catch((error) => {
                console.log(error);
            });

            console.log('[INFO]: Parent Test Case checked for id: ' + qTestParentTestCaseObject.id + ', found ' + qTestParentTestCaseObject.test_steps.length + ' steps.');

            const testName = qTestParentTestCaseObject.name;
            let testCaseSteps = [];
            let properties = [];

            for (c = 0; c < qTestParentTestCaseObject.test_steps.length; c++) {
                testStep = {
                    order: qTestParentTestCaseObject.test_steps[c].order,
                    description: qTestParentTestCaseObject.test_steps[c].description,
                    expected: qTestParentTestCaseObject.test_steps[c].expected
                };
                testCaseSteps.push(testStep);
            }

            const qTestODMVendorFieldValue = qTestParentTestCaseObject.properties.find(obj => obj.field_name === constants.ODMVendorFieldName).field_value_name;
            const qTestODMVendorFieldValueArray = qTestODMVendorFieldValue.substring(1, qTestODMVendorFieldValue.length - 1).split(', ');
            const qTestParentTestCasePID = qTestParentTestCaseObject.pid;
            for(let i=0; i<qTestODMVendorFieldValueArray.length; i++) {
                const childqTestProjectID = qTestProjectListArray.find(obj => obj.name == qTestODMVendorFieldValueArray[i]).id;

                let qTestChildTestCaseObject = {};

                await checkIfChildTestCaseExists(childqTestProjectID, qTestParentTestCasePID).then((object) => {
                    qTestChildTestCaseObject = JSON.parse(object);
                }).catch((error) => {
                    console.log(error);
                });

                let qTestTestCaseFieldListArray =[];
                await getChildTestCaseFieldValues(childqTestProjectID).then((array) => {
                    qTestTestCaseFieldListArray = JSON.parse(array);
                    for (f = 0; f < qTestTestCaseFieldListArray.length; f++) {
                        console.log('[INFO]: Target Field label: '+ qTestTestCaseFieldListArray[f].label);
                        // If test case sharing is enabled in qTest, we want to ignore this field, we also want to skip assignments, 
                        // skip ODM Vendors (parent project assignment only), and also skip Parent ID to handle later
                        if (qTestTestCaseFieldListArray[f].label !== 'Shared' 
                            && qTestTestCaseFieldListArray[f].label !== 'Assigned To'
                            && qTestTestCaseFieldListArray[f].label !== constants.ODMVendorFieldName
                            && qTestTestCaseFieldListArray[f].label !== constants.ParentTestCaseFieldName) {
                            let originalField = qTestParentTestCaseObject.properties.find(obj => obj.field_name == qTestTestCaseFieldListArray[f].label);

                            if (qTestTestCaseFieldListArray[f].allowed_values) {
                                console.log('[INFO]: Updating allowed values...');
                                let updatedFieldValue = qTestTestCaseFieldListArray[f].allowed_values.find(obj => obj.label == originalField.field_value_name);
                                console.log('[INFO]: Original Value id: ' + originalField.field_value);
                                console.log('[INFO]: Original Value name: ' + originalField.field_value_name);
                                console.log('[INFO]: Original Field id: ' + originalField.field_id);
                                console.log('[INFO]: Updated Value id: ' + updatedFieldValue.value);
                                console.log('[INFO]: Updated Field name: ' + updatedFieldValue.label);
                                
                                field = {
                                    field_id: qTestTestCaseFieldListArray[f].id,
                                    field_name: qTestTestCaseFieldListArray[f].label,
                                    field_value: updatedFieldValue.value,
                                    field_value_name: updatedFieldValue.label
                                };
                            } else {
                                console.log('[INFO]: Using original values...');
                                console.log('[INFO]: Original Value id: ' + originalField.field_value);
                                console.log('[INFO]: Original Value name: ' + originalField.field_value_name);
                                console.log('[INFO]: Original Field id: ' + originalField.field_id);
                                
                                field = {
                                    field_id: qTestTestCaseFieldListArray[f].id,
                                    field_name: qTestTestCaseFieldListArray[f].label,
                                    field_value: originalField.field_value,
                                    field_value_name: originalField.field_value_name
                                };
                            }
                            properties.push(field);
                        } else if (qTestTestCaseFieldListArray[f].label == constants.ParentTestCaseFieldName) {
                            // And now we handle the Parent Test Case ID field
                            console.log('[INFO]: Parent ID is being populated from Parent Project...')
                            field = {
                                field_id: qTestTestCaseFieldListArray[f].id,
                                field_name: qTestTestCaseFieldListArray[f].label,
                                field_value: qTestParentTestCasePID
                            }
                            properties.push(field);
                        } else {
                            console.log('[INFO]: Field is not relayed to child project...')
                        }
                    }
                }).catch((error) => {
                    console.log(error);
                });

                let testcasePayload = {
                    name: testName,
                    properties: properties,
                    test_steps: testCaseSteps
                };

                console.log('[DEBUG]: Test Case Payload: '+JSON.stringify(testcasePayload));

                if(qTestChildTestCaseObject.items.length == 1) {
                    console.log("[INFO]: Found test case with ID: "+qTestChildTestCaseObject.items[0].id+" need to be updated.");
                    await createORupdateTestCase(childqTestProjectID, testcasePayload, qTestChildTestCaseObject.items[0].id);
                } else if(qTestChildTestCaseObject.items.length == 0) {
                    console.log("[INFO]: No test case found and need to create one.");
                    await createORupdateTestCase(childqTestProjectID, testcasePayload, 0);
                } else if(qTestChildTestCaseObject.items.length > 1) {
                    console.log("[ERROR]: Redundant Child Test Case Exists!");
                }
                properties = [];
            }
        } else {
            console.log('[INFO]: Test case iterative version ' + testcaseVersion[1] + ' is not required for processing.')
        }
    } else {
        console.log('[INFO]: Project ID ' + payload.testcase.project_id + ' is the not configured Parent Project.')
    }
}
