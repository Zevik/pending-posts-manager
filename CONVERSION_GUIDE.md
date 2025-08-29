# 📋 **מסמך הנחיות מפורט להמרת התוסף GroupsMonitoring לתוסף Pending Posts Scanner**

## 🎯 **סקירה כללית**

אתה מקבל תוסף Chrome בשם **GroupsMonitoring** שסורק פוסטים מקבוצות פייסבוק רגילות. המשימה שלך היא להמיר אותו לתוסף **Pending Posts Scanner** שמטפל בפוסטים ממתינים (pending posts) עם לוגיקה שונה לחלוטין.

---

## 📁 **מבנה התוסף הקיים**

```
GroupsMonitoring/
├── manifest.json - הגדרות התוסף
├── html/options.html - ממשק משתמש להגדרות
├── js/
│   ├── content.js - הקוד הראשי שרץ בפייסבוק
│   ├── background.js - service worker
│   ├── options.js - לוגיקת ממשק ההגדרות
│   ├── vision-api.js - OCR (Google Vision API)
│   └── googleapi-utils.js - Google Sheets integration
├── css/options.css - עיצוב
└── icons/ - אייקונים
```

---

## 🔄 **שינויים נדרשים**

### **1. 📝 manifest.json**

**החלף את כל הקובץ ב:**
```json
{
  "name": "Pending Posts Scanner",
  "version": "1.0.0",
  "manifest_version": 3,
  "description": "Scan pending posts from Facebook groups for keywords and save to Google Sheets",
  "icons": {
    "16": "icons/logo_16.png",
    "32": "icons/logo_32.png",
    "48": "icons/logo_48.png",
    "64": "icons/logo_64.png",
    "128": "icons/logo_128.png"
  },
  "action": {
    "default_title": "Pending Posts Scanner Options"
  },
  "background": {
    "service_worker": "js/background_manager.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.facebook.com/groups/*/pending*",
        "https://mbasic.facebook.com/groups/*/pending*",
        "https://m.facebook.com/groups/*/pending*"
      ],
      "js": [
        "js/lib/jquery-3.5.1.min.js",
        "js/lib/toastr.min.js",
        "js/vision-api.js",
        "js/content.js"
      ],
      "css": [
        "js/lib/toastr.min.css"
      ],
      "run_at": "document_end"
    }
  ],
  "options_page": "html/options.html",
  "oauth2": {
    "client_id": "941632116617-106tsd58o3jaj8np91ccj0srasvfu4t8.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.email"
    ]
  },
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlZ5QEBWFmVT1/bqFxFNhuhHaBfIlWRfQpoNqaZ7znzAMwRrXz6dmFDkmdrvIwgsB4XPf7ZE6+ZK0uqt4qzTnORALR8OqbkFzQpLOkR5YxgDyqy+ojQe9KbnQJyxm3K1DBR06StJFjBJErhxbX57qD/L/vaZEcy4Wk+EbIa/XAOYBUjhulDwczM5Ba+5kaN9BEKl1mfhnSkntCmP5fBtouQS+rA571/qq1cRnIRunfTnvlBHVi3NfpKq2qACnVQLCeQGlldUhN1vm+0BVLHyu9FK0vOmGA22+PY1a5zLQuBp8k2CrT5cyI06QgwFxF2S5vnzu14Il+g/9JwE2x2rHDQIDAQAB",
  "permissions": [
    "identity",
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "https://docs.google.com/forms/*",
    "https://*.facebook.com/*",
    "https://vision.googleapis.com/*"
  ]
}
```

---

### **2. 🎯 js/content.js - שינויים עיקריים**

#### **A. מחק את כל לוגיקת הגלילה:**

**מחק את הפונקציות:**
- `readGroupFeed()` - הפונקציה הראשית שגוללת
- כל הקוד שכולל `window.scrollTo()`
- כל הלוגיקה של `while (true)` loops

#### **B. עדכן את normalMode():**

```javascript
function normalMode(data, sendResponse) {
    if (data.action === 'content-start-scrap-group') {
        sendResponse({success: true});
        config = data.config;
        showInfo('Processing pending posts! page ' + (data.config.pageCounter + 1));
        setTimeout(async function() {
            numberOfRowOnGGSheets = data.config.existingPostURL.length;
            await readPendingPosts(data); // שנה מ-readGroupFeed
        }, 1000);
        return;
    }
}
```

#### **C. הוסף פונקציה חדשה - readPendingPosts:**

```javascript
async function readPendingPosts(data, isRecursiveCall = false) {
    groupIndex = data.config['currGroupIndex'];
    groupName = data.config.groupsConfig['group-name-' + groupIndex];
    keywords = getKeywords(data.config.groupsConfig["keywords-" + groupIndex]);

    console.log('=== STARTING PENDING POSTS SCAN ===');
    console.log('Group Index:', groupIndex);
    console.log('Group Name:', groupName);
    console.log('Keywords:', keywords);
    console.log('Is recursive call:', isRecursiveCall);
    
    showInfo(`Pending Posts Scanner is actively scanning group: ${groupName}`);
    
    // Reset counters only for first call
    if (!isRecursiveCall) {
        window.currentRunPostCount = 0;
        window.processedPosts = new Set();
        console.log('🔄 Reset counters for new group scan');
    }
    
    // Wait for page to load
    await sleep(3000);
    
    // Find pending posts using Approve/Decline buttons
    let approveButtons = document.querySelectorAll('[aria-label*="Approve"], [aria-label*="approve"]');
    let posts = [];
    
    for (let button of approveButtons) {
        let post = button.closest('div[data-pagelet], div[data-testid], div[role="article"]');
        if (!post) {
            // Try finding parent container
            let parent = button.parentElement;
            let attempts = 0;
            while (parent && attempts < 10) {
                if (parent.querySelector('[aria-label*="Decline"], [aria-label*="decline"]')) {
                    post = parent;
                    break;
                }
                parent = parent.parentElement;
                attempts++;
            }
        }
        
        if (post && !posts.includes(post)) {
            posts.push(post);
        }
    }
    
    console.log('Found pending posts:', posts.length);
    
    if (posts.length === 0) {
        console.log('No pending posts found - moving to next group');
        showInfo('No pending posts found');
        chrome.runtime.sendMessage({
            action: "bg-continue-next-group",
            config: data.config
        });
        return;
    }
    
    // Process only the first post
    const firstPost = posts[0];
    console.log('Processing first post of', posts.length, 'total posts');
    
    try {
        await scrapPendingPostData(data, firstPost, keywords);
        
        // Wait before processing next post
        const delayTime = data.config["interval-post"] * 1000;
        await sleep(delayTime);
        
        // Recursive call to process next post
        await readPendingPosts(data, true);
        
    } catch (error) {
        console.log('Error processing post:', error);
        await sleep(3000);
        await readPendingPosts(data, true); // Try again
    }
}
```

#### **D. החלף את scrapPostData ב-scrapPendingPostData:**

```javascript
async function scrapPendingPostData(data, post, keywords) {
    console.log('=== PROCESSING PENDING POST ===');
    
    // Generate unique post ID
    const postId = generatePostId(post);
    console.log('Generated post ID:', postId);
    
    // NO DUPLICATE CHECKING - always process
    
    // Extract URL
    let postURL = findPendingPostURL(post);
    if (!postURL) {
        postURL = postId; // Use generated ID as fallback
    }
    
    // Extract date
    let postDate = findPendingPostDate(post);
    
    // Extract content with OCR support
    const text = await findPendingPostContentWithOCR(post, data.config);
    console.log('Post content found:', text);
    
    // NO KEYWORD FILTERING - process all posts
    let foundKeyword = 'ALL_POSTS_PROCESSED';
    
    showInfo("Processing pending post: " + text.substring(0, 50) + "...");
    
    // Prepare post data
    let postData = {
        'postDate': postDate,
        'wordFound': foundKeyword,
        'content': text,
        'url': postURL,
        'writer': findPendingPostWriter(post),
        'groupName': groupName,
        'status': 'pending'
    };
    
    console.log('Sending to sheets:', postData);
    
    // Save to Google Sheets
    numberOfRowOnGGSheets = numberOfRowOnGGSheets + 1;
    data.config.rowIndex = numberOfRowOnGGSheets;
    data.config.existingPostURL.push(postURL);
    
    chrome.runtime.sendMessage({
        action: "sendToSheets", 
        config: data.config, 
        postData: postData
    });
    
    // Wait for OpenAI decision and perform action
    if (data.config['auto-approve-enabled']) {
        await handleOpenAIAutoApprove(postData, post, data.config);
    }
    
    return true;
}
```

#### **E. הוסף פונקציות חדשות:**

```javascript
// Generate stable post ID
function generatePostId(postElement) {
    const textContent = postElement.innerText || postElement.textContent || '';
    const lines = textContent.split('\n').filter(line => line.trim().length > 3);
    
    if (lines.length > 0) {
        const contentSample = lines[0].substring(0, 50).replace(/[^\w]/g, '_');
        const hash = contentSample.split('').reduce((a, b) => {
            a = ((a << 5) - a + b.charCodeAt(0)) & 0xffffffff;
            return a;
        }, 0);
        return `pending_post_${Math.abs(hash)}_${Date.now() % 10000}`;
    }
    
    return `pending_post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Find pending post content with OCR
async function findPendingPostContentWithOCR(post, config) {
    let postText = await findPendingPostContent(post);
    
    // Add OCR if enabled (same logic as original)
    if (config && config.ocrScan) {
        let imageElement = post.querySelectorAll('[attributionsrc] img');
        if (imageElement.length > 0) {
            console.log('Scanning image with OCR');
            const textImg = await processor.processImage(imageElement[0].src);
            if (textImg && textImg.trim()) {
                postText += "\n\nText from image:\n" + textImg;
            }
        }
    }
    
    return postText;
}

// Extract pending post content
async function findPendingPostContent(post) {
    const allText = post.innerText || post.textContent || '';
    const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Filter out UI elements
    const contentLines = lines.filter(line => {
        return line !== 'Approve' && 
               line !== 'Decline' && 
               line !== 'Send' &&
               line !== 'Facebook' &&
               !line.match(/^\d+[mhd]$/i) &&
               line.length > 2;
    });
    
    // Find meaningful content (skip author line)
    for (let i = 1; i < contentLines.length; i++) {
        if (contentLines[i].length > 10) {
            return contentLines.slice(i).join('\n');
        }
    }
    
    return contentLines.length > 0 ? contentLines.join('\n') : 'No content found';
}

// Find post writer
function findPendingPostWriter(post) {
    // Try to find author name
    let authorElement = post.querySelector('a[href*="/user/"] strong, a[href*="/profile/"] strong');
    if (authorElement && authorElement.innerText) {
        return authorElement.innerText.trim();
    }
    
    // Fallback - look for name-like text
    const lines = post.innerText.split('\n');
    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 2 && trimmed.length < 50 && 
            !trimmed.includes('Approve') && !trimmed.includes('Decline')) {
            return trimmed;
        }
    }
    
    return 'Unknown';
}

// Find post date
function findPendingPostDate(post) {
    const dateElement = post.querySelector('span[title], abbr[title], [data-testid*="timestamp"]');
    if (dateElement && dateElement.title) {
        return dateElement.title;
    }
    
    // Fallback to current date
    return new Date().toLocaleDateString();
}

// Find post URL
function findPendingPostURL(post) {
    const linkElement = post.querySelector('a[href*="/posts/"], a[href*="/permalink/"]');
    if (linkElement && linkElement.href) {
        return linkElement.href;
    }
    return null;
}

// Handle OpenAI auto approve/decline
async function handleOpenAIAutoApprove(postData, post, config) {
    console.log('🤖 Starting OpenAI-based auto approve/decline');
    
    try {
        // Wait for OpenAI decision
        const decision = await waitForOpenAIDecision(config, postData.url);
        
        if (decision) {
            console.log('OpenAI Decision:', decision);
            
            // Find approve/decline buttons
            const approveBtn = post.querySelector('[aria-label*="Approve"], [aria-label*="approve"]');
            const declineBtn = post.querySelector('[aria-label*="Decline"], [aria-label*="decline"]');
            
            if (decision === 'YES' && approveBtn) {
                console.log('✅ Approving post');
                approveBtn.click();
                showInfo('Post approved by OpenAI');
            } else if (decision === 'NO' && declineBtn) {
                console.log('❌ Declining post');
                declineBtn.click();
                showInfo('Post declined by OpenAI');
            } else if (decision === 'SKIP') {
                console.log('⏭️ Skipping post as instructed by OpenAI');
                showInfo('Post skipped by OpenAI');
            }
            
            // Wait for action to complete
            await sleep(2000);
        }
        
    } catch (error) {
        console.error('Error in OpenAI auto approve:', error);
    }
}

// Wait for OpenAI decision from Google Sheets
async function waitForOpenAIDecision(config, postUrl) {
    const maxWaitTime = 300000; // 5 minutes
    const checkInterval = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'readOpenAIDecision',
                    config: config,
                    postUrl: postUrl
                }, resolve);
            });
            
            if (response && response.success && response.decision) {
                return response.decision;
            }
            
            await sleep(checkInterval);
            
        } catch (error) {
            console.error('Error checking OpenAI decision:', error);
            await sleep(checkInterval);
        }
    }
    
    console.log('Timeout waiting for OpenAI decision');
    return null;
}

// Replace the original keyword function
function findKeywordOnText(text, keywords) {
    // Always return a default value since we process all posts
    return 'ALL_POSTS_PROCESSED';
}
```

---

### **3. 🔧 js/background.js**

#### **עדכן את loadSettings:**

```javascript
async function loadSettings(configData) {
    const settingSheetId = configData['setting-sheet-id'];
    let existingList = await loadExistingData(settingSheetId, 'A:Z'); // Changed from A:C
    let groupsConfig = new Object();

    // Check for OCR setting in Z1 (column 25)
    if (existingList.length > 0) {
        configData.ocrScan = existingList[0][25] === 'OCR';
        console.log('OCR setting detected in Z1:', configData.ocrScan);
    }

    let index = 0;
    for (let row of existingList) {
        groupsConfig['group-name-' + index] = row[0];
        groupsConfig['group-url-' + index] = row[1];
        groupsConfig['keywords-' + index] = row[2];
        index++;
    }
    groupsConfig['number-group'] = index - 1;

    configData.groupsConfig = groupsConfig;
    console.log('Finished loading settings', groupsConfig);
    console.log('OCR scan enabled:', configData.ocrScan);
}
```

#### **הוסף פונקציה לקריאת תגובות OpenAI:**

```javascript
// Add to chrome.runtime.onMessage.addListener
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

// Function to read OpenAI decision from Google Sheets column H
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
```

---

### **4. 🎨 html/options.html**

#### **עדכן את הכותרת:**
```html
<title>Pending Posts Scanner Configuration</title>
```

#### **הסר שדות מיותרים:**
```html
<!-- מחק את השורה הזאת: -->
<div class="row">
    <label class="label column-1">Date limitation (days)</label>
    <input id="days-limitation" class="input-data column-2" type="number"/>
</div>

<!-- מחק את השורה הזאת: -->
<div class="row">
    <label class="label column-1">Interval time (minutes) between round</label>
    <input id="interval-round" class="input-data column-2" type="number"/>
</div>
```

#### **הוסף שדות חדשים:**
```html
<!-- הוסף אחרי interval-groups: -->
<div class="row">
    <label class="label column-1">Interval time (seconds) between posts</label>
    <input id="interval-post" class="input-data column-2" type="number"/>
</div>

<!-- הוסף לפני daily break: -->
<div class="row">
    <label class="label column-1">Enable Auto Approve/Decline</label>
    <input id="auto-approve-enabled" class="input-data column-2" type="checkbox"/>
</div>
```

#### **הממשק הסופי צריך להיות:**
```
✅ Interval time (seconds) between posts
✅ Interval time (minutes) between groups  
✅ Setting google sheet URL
✅ Google sheet URL
✅ Google form id
✅ RERUN interval time (hours) [שמור!]
✅ Enable Auto Approve/Decline
✅ Daily break (from/to)
```

---

### **5. ⚙️ js/options.js**

#### **עדכן validation:**
```javascript
function validateInputData() {
    if (!$('#interval-post').val() || $('#interval-post').val() < 0) {
        alert('Interval time (seconds) between posts is invalid!');
        return false;
    }
    if (!$('#interval-groups').val() || $('#interval-groups').val() < 0) {
        alert('Interval time (minutes) between groups is invalid!');
        return false;
    }
    // הסר בדיקות של days-limitation ו-interval-round
    
    if (!$('#rerun-sheetId').val()) {
        alert('Rerun sheet ID is required!');
        return false;
    }
    
    // שמור על בדיקות dailybreak
    return true;
}
```

#### **עדכן save/load:**
```javascript
function saveData(isRunning) {
    let configData = new Object();
    configData['isRunning'] = isRunning;
    configData['interval-post'] = $('#interval-post').val();
    configData['interval-groups'] = $('#interval-groups').val();
    // הסר interval-round ו-days-limitation
    configData['setting-sheet-url'] = $('#setting-sheet-url').val();
    configData['setting-sheet-id'] = getSheetIdFromSheetUrl($('#setting-sheet-url').val());
    configData['sheet-url'] = $('#sheet-url').val();
    configData['sheetId'] = getSheetIdFromSheetUrl($('#sheet-url').val());
    configData['google-form-id'] = $('#google-form-id').val();
    configData['rerun-sheetId'] = $('#rerun-sheetId').val(); // שמור
    configData['auto-approve-enabled'] = $('#auto-approve-enabled').prop('checked');
    configData['dailybreak-from'] = $('#dailybreak-from').val();
    configData['dailybreak-to'] = $('#dailybreak-to').val();

    chrome.storage.sync.set({'groupMonitoringData': configData});
    currConfigData = configData;
}

async function loadData() {
    let data = await getConfigData();
    if (data != undefined) {
        if (data.groupMonitoringData !== undefined) {
            let configData = data.groupMonitoringData;
            $('#interval-post').val(configData["interval-post"]);
            $('#interval-groups').val(configData["interval-groups"]);
            // הסר interval-round ו-days-limitation
            $('#setting-sheet-url').val(configData['setting-sheet-url']);
            $('#sheet-url').val(configData["sheet-url"]);
            $('#google-form-id').val(configData['google-form-id']);
            $('#rerun-sheetId').val(configData["rerun-sheetId"]); // שמור
            $('#auto-approve-enabled').prop('checked', configData["auto-approve-enabled"] || false);
            $('#dailybreak-from').val(configData["dailybreak-from"]);
            $('#dailybreak-to').val(configData["dailybreak-to"]);

            toggleStartStop(configData["isRunning"]);
        }
    }
}
```

---

## 🏗️ **מבנה התהליך החדש**

### **זרימת העבודה:**

1. **אתחול:** המשתמש פותח דף pending posts
2. **זיהוי:** מצא פוסטים ממתינים (עם כפתורי Approve/Decline)
3. **עיבוד הראשון:** טפל רק בפוסט הראשון
4. **חילוץ תוכן:** הפק טקסט + OCR (אם מופעל בZ1)
5. **שמירה:** שלח לגוגל שיטס עם status='pending'
6. **המתנה:** חכה לתגובת OpenAI בעמודה H
7. **פעולה:** לחץ Approve/Decline לפי התגובה
8. **רקורסיה:** קרא ל-`readPendingPosts()` שוב לפוסט הבא

### **Google Sheets Structure:**
- **עמודה A:** תאריך סריקה
- **עמודה B:** תאריך פוסט  
- **עמודה C:** מילת מפתח (תמיד 'ALL_POSTS_PROCESSED')
- **עמודה D:** תוכן פוסט (עם OCR אם יש)
- **עמודה E:** URL פוסט
- **עמודה F:** שם כותב
- **עמודה G:** שם קבוצה
- **עמודה H:** תגובת OpenAI (YES/NO/SKIP)

---

## 🎯 **נקודות קריטיות**

### **1. OCR ללא שינוי:**
- **vision-api.js** נשאר בדיוק כמו שהוא
- **ImageProcessor** נשאר זהה
- בדיקת Z1 (`existingList[0][25] === 'OCR'`) נשארת
- הוספת טקסט מתמונה נשארת זהה

### **2. אין בדיקות כפילויות:**
- מחק `data.config.existingPostURL.includes()`
- מחק `.scraped` classes
- תעבד כל פוסט שנמצא

### **3. אין סינון מילות מפתח:**
- `findKeywordOnText()` תמיד מחזיר 'ALL_POSTS_PROCESSED'
- תעבד כל פוסט ממתין

### **4. עיבוד סדרתי:**
- רק פוסט אחד בכל פעם
- הפוסט נעלם אחרי אישור/דחיה
- קריאה רקורסיבית לפוסט הבא

### **5. RERUN נשאר:**
- שמור על כל הלוגיקה של RERUN
- חשוב לשחזור אוטומטי אם התוסף נעצר

---

## 🚨 **אזהרות חשובות**

1. **אל תשנה** את Google Sheets API integration
2. **אל תשנה** את OAuth2 client_id  
3. **שמור** את כל vision-api.js בדיוק כמו שהוא
4. **ודא** שהתוסף עובד רק על URL של pending posts
5. **זכור** שפוסטים ממתינים נעלמים אחרי אישור/דחיה
6. **שמור** את RERUN functionality

---

## ✅ **בדיקות לפני סיום**

- [ ] התוסף עובד רק על `/pending` URLs
- [ ] OCR מופעל/מכובה לפי תא Z1
- [ ] כל פוסט נשלח לגוגל שיטס ללא סינון
- [ ] המערכת מחכה לתגובת OpenAI בעמודה H
- [ ] כפתורי Approve/Decline עובדים
- [ ] המערכת עוברת לפוסט הבא אחרי פעולה
- [ ] RERUN עובד לשחזור אוטומטי

**בהצלחה! 🚀**