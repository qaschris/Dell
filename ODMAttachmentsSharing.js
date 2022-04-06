const request = require('request');
const { Webhooks } = require('@qasymphony/pulse-sdk');

/* Expected Payload:
{
  "testcase": {
    "child_testcase_id": 52082043,
    "child_project_id": 74528,
    "parent_testcase_id": 51083848,
  }
}
*/

/* Expected Constants:
ManagerURL: The base URL domain name of the qTest instance, e.g. demo.qtestnet.com
QTEST_TOKEN: The Bearer token for the qTest service account user with all necessary project access
ParentProjectId: The ID of the parent project, acquired from the qTest Manager URL or API
*/

exports.handler = async function ({ event: body, constants, triggers }, context, callback) {
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }

    const payload = body;
    
    const collectTestCaseAttachments = async(ProjectId, TestCaseId) => {
        console.log('[DEBUG] (collectTestCaseAttachments): Executing with parameters ' + [ProjectId, TestCaseId].join(', '));
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'GET',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/test-cases/'+TestCaseId+'/attachments',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'Accept-Type': 'application/json',
                    'Content-Type': 'application/json'
                }
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (collectTestCaseAttachments):' + error);
                    return reject(error);
                } else {
                    console.log('[DEBUG] (collectTestCaseAttachments): ' + response.body);
                    return resolve(JSON.parse(response.body));
                }
            });
        });
    }

    const collectTestCaseAttachmentData = async(ProjectId, TestCaseId, AttachmentId) => {
        console.log('[DEBUG] (collectTestCaseAttachmentData): Executing with parameters ' + [ProjectId, TestCaseId, AttachmentId].join(', '));
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'GET',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/test-cases/'+TestCaseId+'/attachments/'+AttachmentId+'?forceDownload=true',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'Accept-Type': 'application/json',
                    'Content-Type': 'application/json'
                },
                'encoding': null
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (collectTestCaseAttachmentData):' + error);
                    return reject(error);
                } else {
                    console.log('[DEBUG] (collectTestCaseAttachmentData): Payload length: ' + response.body.length);
                    return resolve(response.body);
                }
            });
        });
    }
    
    const uploadTestCaseAttachment = async(ProjectId, TestCaseId, AttachmentObject) => {
        console.log('[DEBUG] (uploadTestCaseAttachment): Executing with parameters ' + [ProjectId, TestCaseId, JSON.stringify(AttachmentObject.name)].join(', '));
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'POST',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/test-cases/'+TestCaseId+'/blob-handles',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'File-Name': AttachmentObject.name,
                    'Content-Type': AttachmentObject.content_type
                },
                'encoding': null,
                'body': AttachmentObject.data
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (uploadTestCaseAttachment):' + error);
                    return reject(error);
                } else {
                    console.log('[DEBUG] (uploadTestCaseAttachment): ' + response.body);
                    return resolve(response.body);
                }
            });
        });
    }

    const deleteTestCaseAttachment = async(ProjectId, TestCaseId, AttachmentId) => {
        console.log('[DEBUG] (deleteTestCaseAttachment): Executing with parameters ' + [ProjectId, TestCaseId, AttachmentId].join(', '));
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'DELETE',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ProjectId+'/test-cases/'+TestCaseId+'/blob-handles/'+AttachmentId,
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'Accept-Type': 'application/json',
                    'Content-Type': 'application/json'
                }
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (deleteTestCaseAttachment):' + error);
                    return reject(error);
                } else {
                    console.log('[DEBUG] (deleteTestCaseAttachment): Request Status: ' + response.statusCode);
                    return resolve(response);
                }
            });
        });
    }
    
    const qTestParentTestCaseID = body.testcase.parent_testcase_id;
    const qTestChildTestCaseID = body.testcase.child_testcase_id;
    const qtestChildProjectID = body.testcase.child_project_id;
    
    
    console.log('[INFO]: Checking Parent Test Case for attachments.');
    const qTestParentTestCaseAttachments = await collectTestCaseAttachments(constants.ParentProjectId, qTestParentTestCaseID);
        
    console.log('[INFO]: Parent Test Case checked for attachments: Found ' + qTestParentTestCaseAttachments.length + ' attachments.');
    //console.log('[DEBUG]: Parent Test Case Attachments: ' + JSON.stringify(qTestParentTestCaseAttachments));

    if (qTestParentTestCaseAttachments.length > 0) {
        console.log('[INFO]: Checking Child Test Case for attachments.');
        const qTestChildTestCaseAttachments = await collectTestCaseAttachments(qtestChildProjectID, qTestChildTestCaseID);
            
        console.log('[INFO]: Child Test Case checked for attachments: Found ' + qTestChildTestCaseAttachments.length + ' attachments.');
        //console.log('[DEBUG]: Child Test Case Attachments: ' + JSON.stringify(qTestChildTestCaseAttachments));

        if (qTestChildTestCaseAttachments.length == 0) {
            // none of the attachments are on the child, deploy all attachments
            console.log('[INFO]: No attachments found on child, deploying all.');
            for (let a = 0; a < qTestParentTestCaseAttachments.length; a++) {
                console.log('[INFO]: Retrieving attachment ' + qTestParentTestCaseAttachments[a].name + ' from parent test case...')

                const base64Object =  await collectTestCaseAttachmentData(constants.ParentProjectId, qTestParentTestCaseID, qTestParentTestCaseAttachments[a].id)
                    console.log('[INFO]: Pushing attachment ' + qTestParentTestCaseAttachments[a].name + ' to child test case...')

                    const newTestCaseAttachment = {
                        name: qTestParentTestCaseAttachments[a].name.substring(0, qTestParentTestCaseAttachments[a].name.lastIndexOf('.')) + '_' + qTestParentTestCaseAttachments[a].created_date + qTestParentTestCaseAttachments[a].name.substring(qTestParentTestCaseAttachments[a].name.lastIndexOf('.')),
                        data: base64Object,
                        content_type: qTestParentTestCaseAttachments[a].content_type
                    };
        
                    await uploadTestCaseAttachment(qtestChildProjectID, qTestChildTestCaseID, newTestCaseAttachment);
            }
        } else if (qTestChildTestCaseAttachments.length > 0) {
            // at least some attachments are on the child, compare them and deploy if needed
            console.log('[INFO]: Attachments found on child test case, comparing for deployment.');
            for (let a = 0; a < qTestParentTestCaseAttachments.length; a++) {
                console.log('[INFO]: Checking existence of parent test case attachment ' + qTestParentTestCaseAttachments[a].name + ' in child test case...');
                const childAttachment = qTestChildTestCaseAttachments.filter(ca => {
                    return ca.name.startsWith(qTestParentTestCaseAttachments[a].name.substr(0, qTestParentTestCaseAttachments[a].name.lastIndexOf('.'))) && 
                    ca.name.endsWith(qTestParentTestCaseAttachments[a].name.substr(qTestParentTestCaseAttachments[a].name.lastIndexOf('.')))
                });
                console.log('[DEBUG]: ' + JSON.stringify(childAttachment));
                if (childAttachment !== undefined) {
                    // found a matching attachment, check the date
                    console.log('[INFO]: Attachment "' + qTestParentTestCaseAttachments[a].name + '" exists as "' + childAttachment[0].name + '" in child test case, checking timestamp...');
                    if (childAttachment[0].name.includes(qTestParentTestCaseAttachments[a].created_date)) {
                        // date on child matches date on parent, no update required
                        console.log('[INFO]: Attachment "' + childAttachment[0].name + '" in child matches parent timestamp "' + qTestParentTestCaseAttachments[a].created_date + '", no update required.');
                    } else {
                        // date on child does not match date on parent, delete and upload new attachment
                        console.log('[INFO]: Attachment "' + childAttachment[0].name + '" in child does not match parent timestamp "' + qTestParentTestCaseAttachments[a].created_date + '", update required.');
                        await deleteTestCaseAttachment(qtestChildProjectID, qTestChildTestCaseID, childAttachment[0].id);

                        console.log('[INFO]: Retrieving attachment ' + qTestParentTestCaseAttachments[a].name + ' from parent test case...')
        
                        const base64Object =  await collectTestCaseAttachmentData(constants.ParentProjectId, qTestParentTestCaseID, qTestParentTestCaseAttachments[a].id)
                            console.log('[INFO]: Pushing attachment ' + qTestParentTestCaseAttachments[a].name + ' to child test case...')
        
                            const newTestCaseAttachment = {
                                name: qTestParentTestCaseAttachments[a].name.substring(0, qTestParentTestCaseAttachments[a].name.lastIndexOf('.')) + '_' + qTestParentTestCaseAttachments[a].created_date + qTestParentTestCaseAttachments[a].name.substring(qTestParentTestCaseAttachments[a].name.lastIndexOf('.')),
                                data: base64Object,
                                content_type: qTestParentTestCaseAttachments[a].content_type
                            };
                
                            await uploadTestCaseAttachment(qtestChildProjectID, qTestChildTestCaseID, newTestCaseAttachment);
                    }
                } else {
                    // did not find matching attachment in child, upload this one
                    console.log('[INFO]: Retrieving attachment ' + qTestParentTestCaseAttachments[a].name + ' from parent test case...')
    
                    const base64Object =  await collectTestCaseAttachmentData(constants.ParentProjectId, qTestParentTestCaseID, qTestParentTestCaseAttachments[a].id)
                        console.log('[INFO]: Pushing attachment ' + qTestParentTestCaseAttachments[a].name + ' to child test case...')
    
                        const newTestCaseAttachment = {
                            name: qTestParentTestCaseAttachments[a].name.substring(0, qTestParentTestCaseAttachments[a].name.lastIndexOf('.')) + '_' + qTestParentTestCaseAttachments[a].created_date + qTestParentTestCaseAttachments[a].name.substring(qTestParentTestCaseAttachments[a].name.lastIndexOf('.')),
                            data: base64Object,
                            content_type: qTestParentTestCaseAttachments[a].content_type
                        };
            
                        await uploadTestCaseAttachment(qtestChildProjectID, qTestChildTestCaseID, newTestCaseAttachment);
                }
            }
        }
    }

    emitEvent('ODM_APPROVAL', body);
};
