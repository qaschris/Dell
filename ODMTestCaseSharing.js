const request = require('request');
const { Webhooks } = require('@qasymphony/pulse-sdk');

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
    
    //-- BEGIN CONFIGURATION --//
    // Skip ODM Vendors (parent project assignment only), and also skip Parent ID to handle later
    // Skip shared test case settings and user assignements
    // Skip fields defined as not relayed to the child projects
    const arrUnpopulatedFields = [constants.ODMVendorFieldName, constants.ParentTestCaseFieldName, 'Shared', 'Assigned To', 'Parent Test Case Key', 'Created By', 'Created Date', 'Test Case ID', 'Entity Key', 'Can be shared with vendor?'];
    //--  END CONFIGURATION  --//
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }

    const searchForParentTestCase = async(testcaseID, ParentProjectId) => {
        console.log('[DEBUG] (searchForParentTestCase): Executing with parameters ' + [testcaseID, ParentProjectId].join(', '));
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
                    console.log('[ERROR] (searchForParentTestCase):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    console.log('[DEBUG] (searchForParentTestCase): ' + response.body);
                    return resolve(response.body);
                }
            });

        });
    };

    const createORupdateTestCase = async(childProjectId, testcasePayload, testCaseId) => {
        console.log('[DEBUG] (createORupdateTestCase): Executing with parameters ' + [childProjectId, JSON.stringify(testcasePayload), testCaseId].join(', '));
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
                options.url = options.url + testCaseId;
            }
            console.log('[DEBUG]: Request: ' + JSON.stringify(testcasePayload));
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (createORupdateTestCase):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    //console.log('[DEBUG]: ' + JSON.stringify(response));
                    console.log('[DEBUG] (createORupdateTestCase): ' + response.body);
                    let responseObject = JSON.parse(response.body);
                    let attachmentsPayload = {
                      "testcase": {
                        "child_testcase_id": responseObject.id,
                        "child_project_id": childProjectId,
                        "parent_testcase_id": payload.testcase.id,
                      }
                    };
                    emitEvent('ODM_ATTACHMENT_SHARING', attachmentsPayload);
                    return resolve(responseObject.id);
                }
            });
        });
    }

    const checkIfChildTestCaseExists = async(childProjectId, qTestParentTestCasePID) => {
        console.log('[DEBUG] (checkIfChildTestCaseExists): Executing with parameters ' + [childProjectId, qTestParentTestCasePID].join(', '));
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
                    console.log('[ERROR] (checkIfChildTestCaseExists):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    console.log('[DEBUG] (checkIfChildTestCaseExists): ' + response.body);
                    return resolve(response.body);
                }
            });
        });
    }

    const searchForProjects = async() => {
        console.log('[DEBUG] (searchForProjects): Executing...');
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
                    console.log('[ERROR] (searchForProjects):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    console.log('[DEBUG] (searchForProjects): ' + response.body);
                    return resolve(response.body);
                }
            });
        });
    }

    const getChildTestCaseFieldValues = async(ChildProjectId) => {
        console.log('[DEBUG] (getChildTestCaseFieldValues): Executing with parameters ' + ChildProjectId);
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
                    console.log('[ERROR] (getChildTestCaseFieldValues):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    console.log('[DEBUG] (getChildTestCaseFieldValues): ' + response.body);
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
            console.log('[DEBUG]: Parent Test Case: ' + JSON.stringify(qTestParentTestCaseObject));

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
            if (qTestODMVendorFieldValue === '') {
                console.log('[DEBUG]: No ODM Vendor selected, test case will not be populated.');
                return;
            }
            console.log('[DEBUG]: ' + qTestODMVendorFieldValue);
            const qTestODMVendorFieldValueArray = qTestODMVendorFieldValue.substring(1, qTestODMVendorFieldValue.length - 1).split(', ');
            console.log('[DEBUG]: ' + qTestODMVendorFieldValueArray.join());
            const qTestParentTestCasePID = qTestParentTestCaseObject.id;
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
                    console.log('[DEBUG]: Child Test Case Fields: ' + JSON.stringify(qTestTestCaseFieldListArray));
                    for (f = 0; f < qTestTestCaseFieldListArray.length; f++) {
                        let field;
                        console.log('[INFO]: Target Field label: '+ qTestTestCaseFieldListArray[f].label);
                        if (!arrUnpopulatedFields.includes(qTestTestCaseFieldListArray[f].label)) {
                            let originalField = qTestParentTestCaseObject.properties.find(obj => obj.field_name == qTestTestCaseFieldListArray[f].label);
                            console.log('[DEBUG]: Original Field value: ' + JSON.stringify(originalField));

                            if (qTestTestCaseFieldListArray[f].allowed_values) {
                                console.log('[INFO]: Updating allowed values...');
                                let updatedFieldValue;

                                try {
                                    updatedFieldValue = qTestTestCaseFieldListArray[f].allowed_values.find(obj => obj.label == originalField.field_value_name);
                                }
                                catch (e) {
                                    console.log('[WARNING]: Child Test Case contains Field not contained in Parent, checking for default value...');
                                    updatedFieldValue = qTestTestCaseFieldListArray[f].allowed_values.find(obj => obj.is_default == true);
                                    console.log('[DEBUG]: Updated field value: ' + JSON.stringify(updatedFieldValue));
                                }

                                if (updatedFieldValue === undefined) {                                
                                    if (qTestTestCaseFieldListArray[f].required == true && qTestTestCaseFieldListArray[f].attribute_type == 'ArrayNumber') {
                                        console.log('[INFO]: undefined Field value found, ArrayNumber field, updating to empty array string...');
                                        field = {
                                            field_id: qTestTestCaseFieldListArray[f].id,
                                            field_name: qTestTestCaseFieldListArray[f].label,
                                            field_value: "[]",
                                            field_value_name: ""
                                        };
                                        console.log('[DEBUG]: Field: ' + JSON.stringify(field));
                                        properties.push(field);
                                    } else if (qTestTestCaseFieldListArray[f].required == true && qTestTestCaseFieldListArray[f].attribute_type == 'Number') {
                                        console.log('[INFO]: undefined Field value found, Number field, updating to empty string...');
                                        field = {
                                            field_id: qTestTestCaseFieldListArray[f].id,
                                            field_name: qTestTestCaseFieldListArray[f].label,
                                            field_value: "",
                                            field_value_name: ""
                                        };
                                        console.log('[DEBUG]: Field: ' + JSON.stringify(field));
                                        properties.push(field);
                                    } else {
                                        console.log('[INFO]: undefined Field value found, not a required field, skipping...');
                                    }
                                } else {
                                    console.log('[INFO]: Field value found, updating to new value...');
                                    field = {
                                        field_id: qTestTestCaseFieldListArray[f].id,
                                        field_name: qTestTestCaseFieldListArray[f].label,
                                        field_value: updatedFieldValue.value,
                                        field_value_name: updatedFieldValue.label
                                    };
                                    console.log('[DEBUG]: Field: ' + JSON.stringify(field));
                                    properties.push(field);
                                }                            
                            } else {
                                console.log('[INFO]: Using original value...');
                                
                                field = {
                                    field_id: qTestTestCaseFieldListArray[f].id,
                                    field_name: qTestTestCaseFieldListArray[f].label,
                                    field_value: originalField.field_value,
                                    field_value_name: originalField.field_value_name
                                };
                                console.log('[DEBUG]: Field: ' + JSON.stringify(field));
                                properties.push(field);
                            }
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
                    const childTestCaseId = await createORupdateTestCase(childqTestProjectID, testcasePayload, qTestChildTestCaseObject.items[0].id);
                    //await approveTestCase(childqTestProjectID, childTestCaseId);
                } else if(qTestChildTestCaseObject.items.length == 0) {
                    console.log("[INFO]: No test case found and need to create one.");
                    const childTestCaseId = await createORupdateTestCase(childqTestProjectID, testcasePayload, 0);
                    //await approveTestCase(childqTestProjectID, childTestCaseId);
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
