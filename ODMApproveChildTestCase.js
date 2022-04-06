const request = require('request');
//const { Webhooks } = require('@qasymphony/pulse-sdk');

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
*/

exports.handler = async function ({ event: body, constants, triggers }, context, callback) {    
    const payload = body;

    const approveTestCase = async(ChildProjectId, TestCaseId) => {
        console.log('[DEBUG] (approveTestCase): Executing with parameters ' + [ChildProjectId, TestCaseId].join(', '));
        return await new Promise(async(resolve, reject) => {
            var options = {
                'method': 'PUT',
                'url': 'https://'+constants.ManagerURL+'/api/v3/projects/'+ChildProjectId+'/test-cases/'+TestCaseId+'/approve',
                'headers': {
                    'Authorization': 'Bearer ' + constants.QTEST_TOKEN,
                    'Accept-Type': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            };
            request(options, function (error, response) {
                if (error) {
                    console.log('[ERROR] (approveTestCase):' + JSON.stringify(error));
                    return reject(error);
                } else {
                    console.log('[DEBUG] (approveTestCase): ' + response.body);
                    return resolve(response.body);
                }
            });
        });
    }

    await approveTestCase(payload.testcase.child_project_id, payload.testcase.child_testcase_id).then((object) => {
        console.log('[INFO]: Test case approval for Project ID ' + payload.testcase.child_project_id + ' and Test Case ID ' + payload.testcase.child_testcase_id);
    }).catch((error) => {
        console.log(error);
    });                

}
