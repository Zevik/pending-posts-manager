let currGroupIndex = 0;
let groupIndex;
let currConfigData;
// The extension will check license every hours.
const checkLicenseIntervalTime = 60 * 60 * 1000;

document.addEventListener('DOMContentLoaded', async function() {
    chrome.runtime.sendMessage({action: "checkLicense"}, function(response) {
        if (response && response.ifAllowed) {
            document.querySelector('body').style.display = 'block';
            loadData();
            addEventListeners();
            checkLicenseInterval();
        }
    });
});

function checkLicenseInterval() {
    setInterval(function() {
        chrome.runtime.sendMessage({action: "checkLicense"});
    }, checkLicenseIntervalTime);
}
function addEventListeners() {
    $('#add-icon svg').click(function() {
        addGroupRow(++groupIndex);
    });

    $("#start").click(async function () {
        chrome.runtime.sendMessage({action: "checkLicense"}, function (response) {
            if (response && response.ifAllowed) {
                if (!validateInputData()) {
                    return;
                }
                toggleStartStop(true);
                saveData(true);
                currGroupIndex = 0;
                currConfigData['currGroupIndex'] = 0;
                // transform from hours to miliseconds
                currConfigData['rerun-interval'] = currConfigData['rerun-interval'] * 1000 * 60 * 60 ;
                chrome.runtime.sendMessage({action: "bg-start-scraping-group", config: currConfigData});
            }
        });
    });
    $("#stop").click(function() {
        toggleStartStop(false);
        saveData(false);
        chrome.runtime.sendMessage({action: "stopScrapingFacebookGroup"});
    });
}

function toggleStartStop(isStart) {
    if (isStart) {
        $("#start").css('display', 'none');
        $("#stop").css('display', 'block');
    } else {
        $("#start").css('display', 'block');
        $("#stop").css('display', 'none');
    }

}

function validateInputData() {
    if (!$('#interval-post').val() || $('#interval-post').val() < 0) {
        alert('Interval time (seconds) between post is invalid!');
        return false;
    }
    if (!$('#interval-groups').val() || $('#interval-groups').val() < 0) {
        alert('Interval time (minutes) between groups is invalid!');
        return false;
    }
    if (!$('#interval-round').val() || $('#interval-round').val() < 0) {
        alert('Interval time (seconds) between round is invalid!');
        return false;
    }
    if ($('#scrolling-back-pages').val() && $('#scrolling-back-pages').val() < 0) {
        alert('How many hours scrolling back is invalid!');
        return false;
    }
    if (!$('#rerun-interval').val() || $('#rerun-interval').val() < 0) {
        alert('Rerun interval time (hours) is invalid!');
        return false;
    }

    if ($('#dailybreak-from').val() && !validateHourTime($('#dailybreak-from').val())) {
        alert('Daily break from is invalid!');
        return false;
    }

    if ($('#dailybreak-to').val() && !validateHourTime($('#dailybreak-to').val())) {
        alert('Daily break to is invalid!');
        return false;
    }
    return true;
}

async function loadData() {
    let data = await getConfigData();
    if (data != undefined) {
        // check if data exists.
        if (data.groupMonitoringData !== undefined) {
            let configData = data.groupMonitoringData;
            $('#interval-post').val(configData["interval-post"]);
            $('#interval-groups').val(configData["interval-groups"]);
            $('#interval-round').val(configData["interval-round"]);
            $('#setting-sheet-url').val(configData['setting-sheet-url']);
            $('#sheet-url').val(configData["sheet-url"]);
            $('#google-form-id').val(configData['google-form-id']);
            $('#rerun-interval').val(configData["rerun-interval"]);
            $('#dailybreak-from').val(configData["dailybreak-from"]);
            $('#dailybreak-to').val(configData["dailybreak-to"]);
            $('#scrolling-back-pages').val(configData["scrolling-back-pages"]);

            toggleStartStop(configData["isRunning"]);
        }
    }
}

function getConfigData() {
    return new Promise(function(resolve, reject) {
        chrome.storage.sync.get('groupMonitoringData', function(data) {
           resolve(data);
        });
    });
}

function saveData(isRunning) {
    let configData = new Object();
    configData['isRunning'] = isRunning;
    configData['interval-post'] = $('#interval-post').val();
    configData['interval-groups'] = $('#interval-groups').val();
    configData['interval-round'] = $('#interval-round').val();
    configData['scrolling-back-pages'] = $('#scrolling-back-pages').val();
    configData['setting-sheet-url'] = $('#setting-sheet-url').val();
    configData['setting-sheet-id'] = getSheetIdFromSheetUrl($('#setting-sheet-url').val());
    configData['sheet-url'] = $('#sheet-url').val();
    configData['sheetId'] = getSheetIdFromSheetUrl($('#sheet-url').val());
    configData['google-form-id'] = $('#google-form-id').val();
    configData["rerun-interval"] = $('#rerun-interval').val();

    configData['dailybreak-from'] = $('#dailybreak-from').val();
    configData['dailybreak-to'] = $('#dailybreak-to').val();

    chrome.storage.sync.set({'groupMonitoringData': configData});
    currConfigData = configData;
}

function getSheetIdFromSheetUrl(url) {
    return url.split('/')[5];
}

function validateHourTime(hourTime) {
    return /^([0-1]?[0-9]|2[0-4]):([0-5][0-9])(:[0-5][0-9])?$/.test(hourTime);
}
