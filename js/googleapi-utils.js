/**
 * Append new row to sheet
 * @param sheetId
 * @param postData
 * @returns {Promise<PromiseLike<*> | Promise<*> | *>}
 */
async function appendToSheet(sheetId, postData) {
    let row = [];
    row.push(postData["scrapDate"]);
    row.push(postData["postDate"]);
    row.push(postData["wordFound"]);
    row.push(postData["content"]);
    row.push(postData["url"]);
    row.push(postData["writer"]);
    row.push(postData["groupName"]);
    var rangeEnd = String.fromCharCode('A'.charCodeAt(0) + row.length);
    var appendParams = {
        'spreadsheetId': sheetId,
        'range': 'A:' + rangeEnd,
        'valueInputOption': 'RAW',
    };
    var valueRangeBody = {
        'majorDimension': 'ROWS',
        'values': [
            row
        ]
    };

    return appendGoogleSheets(appendParams, valueRangeBody);
}


async function appendGoogleSheets(appendParams, valueRangeBody) {
    chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
        console.log('token', token);
        if (token === undefined) {
            console.log('Error authenticating with Google Drive');
        } else {
            const author = "Bearer " + token;
            const sheetId = appendParams.spreadsheetId;
            const range = appendParams.range;
            const valueInputOption = appendParams.valueInputOption;
            const url = "https://content-sheets.googleapis.com/v4/spreadsheets/" + sheetId + "/values/" + range + ":append?valueInputOption=" + valueInputOption + "&alt=json";
            fetch(url, {
                "headers": {
                    "authorization": author,
                },
                "body": JSON.stringify(valueRangeBody),
                "method": "POST",
            })
                .then(function() {
                    console.log('Successfully appended row');
                }, function(response) {
                    console.log('Error appnding row');
                    console.log(response);
                })
        }
    });
}
/**
 * Get current data in the sheet
 * @param sheetId
 * @returns {Promise<any>}
 */
function getCurrentDataList(sheetId, range) {
    const result = getDataFromGoogleSheets(sheetId, range);
    console.log('result', result);
    return result;
}

function getDataFromGoogleSheets(sheetId, range) {
    return new Promise(function(resolve, reject) {
        chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
            console.log('token', token);
            if (token === undefined) {
                console.log('Error authenticating with Google Drive');
            } else {
                const author = "Bearer " + token;
                const url = "https://content-sheets.googleapis.com/v4/spreadsheets/" + sheetId + "/values/" + range;
                fetch(url, {
                    "headers": {
                        "authorization": author,
                    },
                    "method": "GET",
                })
                    .then(response => response.json())
                    .then((jsonResult) => {
                        resolve(jsonResult["values"]);
                    })
                    .catch(error => console.warn(error));
            }
        });
    });
}
