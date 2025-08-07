let timeoutNextTimes;
let delayBetweenGroup;
chrome.action.onClicked.addListener(tab => {
    chrome.tabs.create({url:'../html/options.html'});
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    checkLicenseAPI(request, sender).then(sendResponse);
    return true; // return true to indicate you want to send a response asynchronously
});

async function checkLicenseAPI(request, sender) {
    if (request.action == 'checkLicense') {
        // var license = await windowapis.license.checkAndInteractAsync({ifRemindAboutTrial: false});
        // if (!license.ifAllowed) {
        //     chrome.tabs.remove(sender.tab.id);
        //     return null;
        // }
        let license = new Object();
        license.ifAllowed = true;
        return license;
    }
    return null;
}

let mainTabId;
let lastMainTabUrl;
let rerunIntervalTime;
let currentData;

async function startScrapingGroup(configData) {
    await loadSettings(configData);
    console.log('load config', configData);

    configData['currGroupIndex'] = 0;
    configData['roundCounter'] = 1;
    configData.pageCounter = 0;

    let googleFormUrl = getGoogleFormUrl(configData['google-form-id']);
    configData.entryListNames = await getFormFieldIds(googleFormUrl);
    configData.formId = configData['google-form-id'];
    console.log('Start with configData', configData);

    let existingList = await loadExistingData(configData.sheetId, 'A:G');

    configData.existingPostURL = [];
    for (let row of existingList) {
        configData.existingPostURL.push(row[4]);
    }

    currentData = configData;

    startAutoScrapAGroup(configData);
}

chrome.runtime.onMessage.addListener(async function(data, sender, sendResponse) {
    try {
        console.log('data', data);
        if (data.action == 'sendToSheets') {
            console.log('data.rowIndex', data.config.rowIndex);
            sendToGoogleForm(data, data.postData);
            return;
        }
        if (data.action == 'readOpenAIDecision') {
            console.log('📖 Reading OpenAI decision from sheets for post:', data.postUrl);
            try {
                const decision = await readOpenAIDecisionFromSheets(data.config, data.postUrl);
                sendResponse({success: true, decision: decision});
            } catch (error) {
                console.log('❌ Error reading OpenAI decision:', error);
                sendResponse({success: false, error: error.message});
            }
            return true; // Keep message channel open for async response
        }
        if (data.action == 'bg-start-scraping-group') {
            initializeRerunData();
            rerunIntervalTime = data.config['rerun-interval'];
            await startScrapingGroup(data.config);
            return;
        }

        if (data.action == 'bg-rerun-scraping-group') {
            chrome.storage.sync.get('groupMonitoringData', function(data) {
                if (data.groupMonitoringData !== undefined) {
                    let configData = data.groupMonitoringData;
                    if (configData["isRunning"]) {
                        startScrapingGroup(configData);
                    }
                }
            });
            return;
        }

        if (data.action == 'bg-continue-next-group') {
            console.log('currGroupIndex', data.config['currGroupIndex']);
            if (data.config['currGroupIndex'] > data.config.groupsConfig['number-group'] - 1) {
                // show waiting next round message if this is the last round.
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'content-show-waiting-next-round',
                    roundIdx: data.config['roundCounter']
                });
                // no need time out if this is the l ast group
                startAutoScrapAGroup(data.config)
                return;
            }

            let timeout = 0;
            if (data.config['interval-groups'] && !data.isBlock) {
                timeout = data.config['interval-groups'] * 60 * 1000;
            }
            console.log('time out', timeout);
            delayBetweenGroup = setTimeout(function() {
                data.config.pageCounter = 0;

                startAutoScrapAGroup(data.config)
            }, timeout);
            return;
        }

        if (data.action == 'bg-continue-next-page') {
            continueNextPage(data);
            return;
        }

        if (data.action == 'stopScrapingFacebookGroup') {
            chrome.tabs.query({},function(tabs){
                tabs.forEach(function(tab){
                    if ((tab.url.indexOf('https://mbasic.facebook.com/groups') > -1 ||
                         tab.url.indexOf('https://www.facebook.com/groups') > -1)
                        && tab.url.indexOf('scrapIndex') > -1) {
                        chrome.tabs.remove(tab.id);
                    }
                });
            });
            clearTimeout(timeoutNextTimes);
            clearTimeout(delayBetweenGroup);
            stopRerunCheck();
            return;
        }

        if (data.action === 'bg-stopByblockGroup') {
            clearTimeout(timeoutNextTimes);
            clearTimeout(delayBetweenGroup);
            stopRerunCheck();
            return;
        }

        if (data.newTabUrl) {
            openNewTab(data.newTabUrl);
            return;
        }
    } catch (e) {
        console.log('error', e);
        chrome.storage.sync.get('groupMonitoringData', function(data) {
            if (data.groupMonitoringData !== undefined) {
                let configData = data.groupMonitoringData;
                if (configData["isRunning"]) {
                    console.log('There is an error during running GroupMonitoring..................');
                    console.log('Rerun the task....................................................');
                    stopRerunCheck();
                    startRerunCheck();
                    startScrapingGroup(configData);
                }
            }
        });
    }
});

function initializeRerunData() {
    mainTabId = null;
    lastMainTabUrl = null;
}
let rerunInterval;
function startRerunCheck() {
    clearInterval(rerunInterval);
    rerunInterval = setInterval(function() {
        console.log('Check rerun');
        // dont check when in breaktime.
        if (isBreakTime(currentData, function(){})) {
            console.log('Break time, dont check....');
            return;
        }
        chrome.tabs.query({}, function(tabs) {
            let foundTab = false;
            for (let tab of tabs) {
                if (tab.id === mainTabId) {
                    foundTab = true;
                    if (!lastMainTabUrl) {
                        lastMainTabUrl = tab.url;
                        return;
                    }
                    console.log('Compare url:', lastMainTabUrl, tab.url);


                    // if the url is the same -> rerun
                    if (lastMainTabUrl === tab.url) {
                        stopRerunCheck();

                        console.log('MaintabId', mainTabId);
                        // close current tabs
                        chrome.tabs.query({}, function(tabs) {
                            for (let tab of tabs) {
                                if (tab.id === mainTabId) {
                                    console.log('Remove maintabId');
                                    chrome.tabs.remove(mainTabId);
                                }
                            }
                        });

                        setTimeout(function() {
                            console.log('----------Rerun----------------');
                            initializeRerunData();
                            stopRerunCheck();

                            // rerun
                            let data = currentData;
                            startRerunCheck();
                            startScrapingGroup(data);
                        }, 500);
                    } else {
                        // store last main tab url
                        lastMainTabUrl = tab.url;
                    }
                    break;
                }
            }

            if (!foundTab) {
                console.log('Stop rerun since unable to find maintabId');
                stopRerunCheck();
            }
        } );
    }, rerunIntervalTime);
}

function stopRerunCheck() {
    console.log('stop Rerun');
    clearInterval(rerunInterval);
}

/**
 * get the form url from google form id
 * For example: https://docs.google.com/forms/d/e/1FAIpQLSfzxPcUDsrexAuKmXbQ9f_uPByexCBey9nFP5tOTmMDZg9bQQ/viewform
 * @param formUrl
 */
function getGoogleFormUrl(formId) {
    return "https://docs.google.com/forms/d/e/" + formId + "/viewform";
}

async function getFormFieldIds(formUrl) {
    let entryListNames = await fetch(formUrl).then(function (response) {
        // The API call was successful!
        return response.text();
    }).then(function (html) {
        // Get data
        html = findTextBetween(html, 'var FB_PUBLIC_LOAD_DATA_ =', '</script>').replace('</script>', '');
        let facebookData = JSON.parse(html
            .replace('var FB_PUBLIC_LOAD_DATA_ =', '').replaceAll(';',''));;

        let inputsData = facebookData[1][1];
        let entryListNames = [];
        for (let inputData of inputsData) {
            entryListNames.push("entry." + inputData[4][0][0]);
        }
        console.log('entryListNames', entryListNames);
        return entryListNames;

    }).catch(function (err) {
        // There was an error
        throw err;
    });
    console.log('return entryListNames', entryListNames);
    return entryListNames;
}

function findTextBetween(str, begin, end) {
    return str.split(begin)[1].split(end)[0];
}

async function loadSettings(configData) {
    const settingSheetId = configData['setting-sheet-id'];
    let existingList = await loadExistingData(settingSheetId, 'A:C');
    let groupsConfig = new Object();

    let index = 0;
    for (let row of existingList) {
        groupsConfig['group-name-' + index] = row[0];
        groupsConfig['group-url-' + index] = row[1];
        groupsConfig['keywords-' + index] = row[2];
        index++;
    }
    groupsConfig['number-group'] = index - 1;

    configData.groupsConfig = groupsConfig;
    console.log('finish load setting', groupsConfig);
}

function openNewTab(newTabUrl) {
    chrome.tabs.query({}, function (tabs) {
        let tabId;
        tabs.forEach(function (tab) {
            if (tabId) {
                return;
            }
            if (tab.url.indexOf('scrapIndex') > -1) {
                tabId = tab.id;
            }
        });
        if (tabId) {
            chrome.tabs.update(tabId, {url: newTabUrl});
        } else {
            mainTabId = data.config['mainTabId'];
            chrome.tabs.create({ url: newTabUrl, active: true });
        }
    });
}

function isBreakTime(config, functionCallback) {
    // check break time
    let dailyBreakFrom = config['dailybreak-from'];
    let dailyBreakTo = config['dailybreak-to'];
    if (!isBlank(dailyBreakFrom) && !isBlank(dailyBreakTo)) {
        const now = new Date();
        const breakFrom = new Date();
        breakFrom.setHours(dailyBreakFrom.split(':')[0]);
        breakFrom.setMinutes(dailyBreakFrom.split(':')[1]);
        const breakTo = new Date();
        breakTo.setHours(dailyBreakTo.split(':')[0]);
        breakTo.setMinutes(dailyBreakTo.split(':')[1]);
        if (breakFrom.getHours() > breakTo.getHours()) {
            breakTo.setDate(breakTo.getDate() + 1);
        }
        if (now > breakFrom && now < breakTo) {
            console.log('delay');
            clearTimeout(timeoutNextTimes);
            clearTimeout(delayBetweenGroup);
            timeoutNextTimes = setTimeout(functionCallback, 1 * 60 * 1000);
            return true;
        }

        console.log('continue');
    }

    return false;
}

function startAutoScrapAGroup(config) {
    let groupUrl;
    let keywords;

    do {
        let functionCallback = function() {
            startAutoScrapAGroup(config);
        };
        if (isBreakTime(config, functionCallback)) {
            return;
        }

        console.log('currGroupIndex', config['currGroupIndex']);
        config['currGroupIndex'] = config['currGroupIndex'] + 1;
        if (config['currGroupIndex'] > config.groupsConfig['number-group']) {
            config['currGroupIndex'] = 0;
            config['roundCounter'] = config['roundCounter'] + 1;
            timeoutNextTimes = setTimeout(async function() {

                // Reload when go to next round
                await loadSettings(config);
                console.log('reload config', config);
                functionCallback();
            }, config['interval-round'] * 60 * 1000);
            return;
        }
        groupUrl = config.groupsConfig['group-url-' + config['currGroupIndex']];
        keywords = config.groupsConfig['keywords-' + config['currGroupIndex']];
    } while (isBlank(groupUrl) && isBlank(keywords));

    // For pending posts, keep original URL structure but ensure it's using regular Facebook (not mbasic)
    let newTabUrl;
    if (groupUrl.includes('/pending')) {
        // If URL already has /pending, add scrapIndex parameter appropriately
        newTabUrl = groupUrl + (groupUrl.includes('?') ? '&' : '?') + 'scrapIndex=' + config['currGroupIndex'];
        // Keep as www.facebook.com for pending posts interface
        newTabUrl = newTabUrl.replace('mbasic.', 'www.');
    } else {
        // Original logic for regular group URLs
        newTabUrl = groupUrl + '?scrapIndex=' + config['currGroupIndex'];
        newTabUrl = newTabUrl.replace('www.', 'mbasic.');
    }

    chrome.tabs.query({}, function (tabs) {

        let tabId;
        tabs.forEach(function (tab) {
            if (tabId) {
                return;
            }
            if (tab.url.indexOf('scrapIndex') > -1) {
                tabId = tab.id;
            }
        });
        console.log('tabId', tabId);
        if (tabId) {

            chrome.tabs.update(tabId, {url: newTabUrl}, function() {

                askContentStartScraping(config, tabId);
            });
        } else {
            console.log('Create new tab');
            chrome.tabs.create({url: newTabUrl, active: true}, function (tab) {
                mainTabId = tab.id;
                startRerunCheck();

                console.log('tabId', tab);
                chrome.tabs.update(tab.id, {selected: true});
                askContentStartScraping(config, tab.id);
            });
        }
    });
}

function continueNextPage(data) {
    let functionCallback = function() {
        continueNextPage(data);
    };
    if (isBreakTime(data.config, functionCallback)) {
        return;
    }
    let newTabUrl = data.nextPageHref + '&scrapIndex=' + data.config['currGroupIndex'];
    chrome.tabs.query({}, function (tabs) {
        let tabId;
        tabs.forEach(function (tab) {
            if (tabId) {
                return;
            }
            if (tab.url.indexOf('scrapIndex') > -1) {
                tabId = tab.id;
            }
        });
        console.log('tabId', tabId);
        if (tabId) {
            console.log('update old tab', tabId);
            chrome.tabs.update(tabId, {url: newTabUrl}, function() {
                askContentStartScraping(data.config, tabId);
            });
        } else {
            console.log('Create new tab');
            chrome.tabs.create({url: newTabUrl, active: true}, function (tab) {
                console.log('tabId', tab);
                chrome.tabs.update(tab.id, {selected: true});
                askContentStartScraping(data.config, tab.id);
            });
        }
    });
}

function askContentStartScraping(config, tabId) {
    console.log('=== ASKING CONTENT TO START SCRAPING ===');
    console.log('tabId', tabId);
    console.log('currGroupIndex', config.currGroupIndex);
    console.log('Group URL', config.groupsConfig['group-url-' + config.currGroupIndex]);
    
    // First, test if content script is loaded by sending a ping
    setTimeout(function() {
        console.log('Sending ping to test content script...');
        chrome.tabs.sendMessage(tabId, {
            action: 'ping'
        }, function(response) {
            if (chrome.runtime.lastError) {
                console.log('Error pinging content script:', chrome.runtime.lastError.message);
                console.log('Content script may not be loaded. Waiting longer...');
                
                // Try again after more delay
                setTimeout(function() {
                    console.log('Sending actual scraping message after extended delay...');
                    chrome.tabs.sendMessage(tabId, {
                        action: 'content-start-scrap-group',
                        config: config
                    });
                }, 5000);
            } else {
                console.log('Content script responded to ping:', response);
                // Content script is ready, send the actual message
                setTimeout(function() {
                    console.log('Sending scraping message after successful ping...');
                    chrome.tabs.sendMessage(tabId, {
                        action: 'content-start-scrap-group',
                        config: config
                    });
                }, 1000);
            }
        });
    }, 5000);
}

function sendToGoogleForm(data, postData) {
    const entryListNames = data.config.entryListNames;
    let inputParams = new URLSearchParams();

    inputParams.append(entryListNames[0], postData["postDate"]);
    inputParams.append(entryListNames[1], postData["wordFound"]);
    inputParams.append(entryListNames[2], postData["content"]);
    inputParams.append(entryListNames[3], postData["url"]);
    inputParams.append(entryListNames[4], postData["writer"]);
    inputParams.append(entryListNames[5], postData["groupName"]);
    console.log('inputParams', inputParams);
    const postFormUrl = " https://docs.google.com/forms/d/e/" + data.config.formId + "/formResponse";

    fetch(postFormUrl, {
        "headers": {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        "body": inputParams,
        "method": "POST",
    })
    .then(response => response.text())
    .catch(error => console.warn(error));

}

async function sendToSheets(sheetId, postData) {
    await appendToSheet(sheetId, postData);
}

async function loadExistingData(sheetId, range) {
    return await getCurrentDataList(sheetId, range);
}

// Read OpenAI decision from Google Sheets column H
async function readOpenAIDecisionFromSheets(config, postUrl) {
    console.log('🔍 Looking for OpenAI decision in sheets for post URL:', postUrl);
    
    try {
        // Load all data from the sheet
        const allData = await getCurrentDataList(config.sheetId, 'A:H');
        
        console.log('📊 Loaded', allData.length, 'rows from sheet');
        
        // Find the row with matching post URL (column E - index 4)
        for (let i = 0; i < allData.length; i++) {
            const row = allData[i];
            if (row.length > 4 && row[4] === postUrl) {
                // Found the matching row, check column H (index 7)
                const decision = row.length > 7 ? row[7] : null;
                console.log('✅ Found matching row', i + 1, 'for URL:', postUrl);
                console.log('🤖 OpenAI decision in column H:', decision);
                
                if (decision && decision.trim()) {
                    const cleanDecision = decision.trim().toUpperCase();
                    if (cleanDecision === 'YES' || cleanDecision === 'NO' || cleanDecision === 'SKIP') {
                        return cleanDecision;
                    }
                }
                
                // Row found but no valid decision yet
                console.log('⏳ Row found but no valid OpenAI decision yet');
                return null;
            }
        }
        
        console.log('❌ No matching row found for URL:', postUrl);
        return null;
        
    } catch (error) {
        console.log('❌ Error reading from Google Sheets:', error);
        throw error;
    }
}

function isBlank(str) {
    return (!str || /^\s*$/.test(str));
}
