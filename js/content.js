const DEBUG = true;
let groupIndex;
let keywords;
let groupName;
let numberOfRowOnGGSheets;

// Listen for when the content script is loaded and ready
window.addEventListener('load', function() {
    console.log('=== PAGE LOADED - CONTENT SCRIPT READY ===');
});

// Also listen for DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== DOM LOADED - CONTENT SCRIPT READY ===');
});

// Show a visual indicator that the extension is active
if (window.location.href.includes('/pending')) {
    setTimeout(() => {
        showInfo('Pending Posts Scanner is active on this page');
    }, 2000);
}

toastr.options = {
    "closeButton": false,
    "debug": false,
    "newestOnTop": false,
    "progressBar": false,
    "positionClass": "toast-top-right",
    "preventDuplicates": false,
    "onclick": null,
    "showDuration": "300",
    "hideDuration": "1000",
    "timeOut": "0",
    "extendedTimeOut": "0",
    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut"
}

function showInfo(message) {
    toastr.clear();
    setTimeout(function() {
        toastr.info(message);
    }, 300);
}

window.onunhandledrejection = function (evt) {
    console.log('Error', evt);
    chrome.runtime.sendMessage({
        action: "bg-rerun-scraping-group"
    });
};

chrome.runtime.onMessage.addListener(async function(data, sender, sendResponse) {
    try {
        console.log('=== CONTENT SCRIPT RECEIVED MESSAGE ===');
        console.log('Action:', data.action);
        console.log('Current URL:', window.location.href);
        
        // Handle ping message
        if (data.action === 'ping') {
            console.log('Received ping, sending pong');
            sendResponse({status: 'pong', url: window.location.href});
            return true; // Keep message channel open for async response
        }
        
        if (isErrorPage()) {
            console.log('ERROR PAGE DETECTED');
            showInfo('The operation has been stopped by Facebook due to over activities. It is recommended to wait a few hours and try again');
            chrome.runtime.sendMessage({action: 'bg-stopByblockGroup'});
            return;
        }

        const isBlocked = isBlockPage();
        console.log('Is page blocked?', isBlocked);
        
        if (isBlocked) {
            console.log('BLOCK PAGE DETECTED - sending continue message');
            chrome.runtime.sendMessage({
                action: "bg-continue-next-group",
                config: data.config,
                isBlock: true
            });
            return;
        }
        
        console.log('Page is NOT blocked, proceeding...');
        
        if (data.action == 'content-start-scrap-group') {
            // Check if we're on a pending posts page
            if (!window.location.href.includes('/pending')) {
                console.log('NOT ON PENDING POSTS PAGE');
                showInfo('Not on pending posts page. Please make sure URLs end with /pending');
                chrome.runtime.sendMessage({
                    action: "bg-continue-next-group",
                    config: data.config
                });
                return;
            }
            
            // Additional check - make sure we're actually on the pending posts interface
            const pageText = document.body.innerText.toLowerCase();
            const hasPendingIndicators = pageText.includes('pending') || 
                                       pageText.includes('ממתין') || 
                                       pageText.includes('approve') || 
                                       pageText.includes('decline') ||
                                       document.querySelector('[data-testid*="pending"]') ||
                                       document.querySelector('[aria-label*="pending" i]');
            
            if (!hasPendingIndicators) {
                console.log('PAGE DOES NOT SEEM TO BE PENDING POSTS INTERFACE');
                showInfo('This does not appear to be a pending posts page. Check your URL and admin permissions.');
                chrome.runtime.sendMessage({
                    action: "bg-continue-next-group",
                    config: data.config
                });
                return;
            }
            
            console.log('ON PENDING POSTS PAGE - starting scan');
            showInfo('Processing pending posts! page ' + (data.config.pageCounter + 1));
            setTimeout(async function() {
                numberOfRowOnGGSheets = data.config.existingPostURL.length;
                await readPendingPosts(data);
            }, 1000);
            return;
        }

        if (data.action == 'content-show-waiting-next-round') {
            showInfo('Finish round ' + data.roundIdx + ', waiting for the next round!');
            return;
        }
    } catch (e) {
        console.log('error when run task', e);
        chrome.runtime.sendMessage({
            action: "bg-rerun-scraping-group"
        });
    }
});

async function readPendingPosts(data) {
    groupIndex = data.config['currGroupIndex'];
    groupName = data.config.groupsConfig['group-name-' + groupIndex];
    keywords = data.config.groupsConfig["keywords-" + groupIndex].split(',');

    console.log('=== STARTING PENDING POSTS SCAN ===');
    console.log('Group Index:', groupIndex);
    console.log('Group Name:', groupName);
    console.log('Keywords:', keywords);
    console.log('Current URL:', window.location.href);
    
    // Wait a bit for page to fully load
    await sleep(2000);
    
    // Debug: Log page structure
    if (DEBUG) {
        console.log('Page title:', document.title);
        console.log('Main containers found:', document.querySelectorAll('[role="main"]').length);
        console.log('Articles found:', document.querySelectorAll('[role="article"]').length);
        console.log('Data pagelets:', Array.from(document.querySelectorAll('[data-pagelet]')).map(el => el.getAttribute('data-pagelet')));
        
        // Log some common Facebook selectors to debug
        console.log('Feed containers:', document.querySelectorAll('[data-testid*="feed"]').length);
        console.log('Post containers:', document.querySelectorAll('[data-testid*="post"]').length);
        console.log('Story containers:', document.querySelectorAll('[data-testid*="story"]').length);
    }
    
    // Multiple selectors for different Facebook interfaces
    let posts = [];
    
    // Try modern Facebook pending posts selectors (most specific first)
    posts = document.querySelectorAll('[data-pagelet="PendingPostsPagelet"] [role="article"]');
    console.log('Found posts with PendingPostsPagelet:', posts.length);
    
    if (posts.length === 0) {
        posts = document.querySelectorAll('[data-testid="pending-posts-feed"] [role="article"]');
        console.log('Found posts with pending-posts-feed:', posts.length);
    }
    
    if (posts.length === 0) {
        posts = document.querySelectorAll('[aria-label*="Pending" i] [role="article"]');
        console.log('Found posts with Pending aria-label:', posts.length);
    }
    
    if (posts.length === 0) {
        // Look for pending posts by checking for Approve/Decline buttons
        posts = document.querySelectorAll('[role="article"]:has([aria-label*="Approve" i]), [role="article"]:has([aria-label*="Decline" i])');
        console.log('Found posts with Approve/Decline buttons:', posts.length);
    }
    
    if (posts.length === 0) {
        // Try broader selectors for pending posts area
        posts = document.querySelectorAll('[data-pagelet*="pending" i] [role="article"]');
        console.log('Found posts with pending pagelet:', posts.length);
    }
    
    if (posts.length === 0) {
        // Look for any article in the main content area
        posts = document.querySelectorAll('div[role="main"] [role="article"]');
        console.log('Found posts with main role:', posts.length);
        
        // Filter to only those that seem to be pending posts
        const filteredPosts = [];
        for (let post of posts) {
            const postText = post.innerText.toLowerCase();
            if (postText.includes('approve') || postText.includes('decline') || 
                postText.includes('pending') || postText.includes('ממתין')) {
                filteredPosts.push(post);
            }
        }
        posts = filteredPosts;
        console.log('Filtered posts that seem to be pending:', posts.length);
    }
    
    if (posts.length === 0) {
        // Try Facebook-specific post selectors
        posts = document.querySelectorAll('[data-testid="story"] [role="article"]');
        console.log('Found posts with story testid:', posts.length);
    }
    
    if (posts.length === 0) {
        // Very broad selector - any div that might be a post
        const allDivs = document.querySelectorAll('div');
        const potentialPosts = [];
        for (let div of allDivs) {
            // Look for divs that contain both text content and approve/decline buttons
            const divText = div.innerText;
            if (divText && divText.length > 50 && 
                (divText.includes('Approve') || divText.includes('Decline') || 
                 divText.includes('אישור') || divText.includes('דחיה'))) {
                potentialPosts.push(div);
            }
        }
        posts = potentialPosts;
        console.log('Found potential posts with manual detection:', posts.length);
    }
    
    console.log('=== TOTAL PENDING POSTS FOUND:', posts.length, '===');
    
    // Debug: Show what we found
    if (DEBUG && posts.length > 0) {
        console.log('First post structure:', posts[0]);
        console.log('First post HTML sample:', posts[0].outerHTML.substring(0, 200) + '...');
        console.log('First post content attempt:', findPendingPostContent(posts[0]));
    }
    
    if (posts.length === 0) {
        // Check if we're actually on a pending posts page
        const url = window.location.href;
        console.log('No posts found - analyzing page...');
        console.log('Current URL:', url);
        
        if (url.includes('/pending')) {
            const pageText = document.body.innerText.toLowerCase();
            console.log('Page text sample:', pageText.substring(0, 500));
            console.log('Page contains "approve":', pageText.includes('approve'));
            console.log('Page contains "decline":', pageText.includes('decline'));
            console.log('Page contains "pending":', pageText.includes('pending'));
            console.log('Page contains Hebrew "ממתין":', pageText.includes('ממתין'));
            
            // Log DOM structure for debugging
            console.log('All [role="article"] elements:', document.querySelectorAll('[role="article"]').length);
            console.log('All elements with "pending" in data attributes:');
            document.querySelectorAll('[data-testid*="pending"], [data-pagelet*="pending"]').forEach((el, i) => {
                console.log(`  ${i+1}:`, el.tagName, el.getAttribute('data-testid'), el.getAttribute('data-pagelet'));
            });
            
            // Check for common "no posts" messages
            if (pageText.includes('no pending posts') || 
                pageText.includes('אין פוסטים ממתינים') ||
                pageText.includes('nothing to review') ||
                pageText.includes('all caught up')) {
                showInfo("No pending posts found in this group - that's normal! Moving to next group.");
            } else if (pageText.includes('permission') || pageText.includes('access')) {
                showInfo("Access denied - you may not be an admin/moderator of this group.");
            } else {
                showInfo("Pending posts page loaded but no posts found. Check if there are actually pending posts or if page structure changed.");
            }
        } else {
            showInfo("Error: Not on pending posts page. Please check URL format.");
        }
        
        chrome.runtime.sendMessage({
            action: "bg-continue-next-group",
            config: data.config
        });
        return;
    }

    for (let post of posts) {
        try {
            await scrapPendingPostData(data, post, keywords);
            const delayTime = data.config["interval-post"] * 1000;
            const randomDelayTime = delayTime + delayTime / 100 * getRandomInt(10, 15);
            await sleep(randomDelayTime);
        } catch (error) {
            // ignore to go to next post
            console.log('Error processing pending post:', error);
        }
    }

    // For pending posts, we typically don't have pagination like regular feed
    // So we finish with the current group and move to next
    showInfo("Finished processing pending posts, go to next group!");
    chrome.runtime.sendMessage({
        action: "bg-continue-next-group",
        config: data.config
    });
}

function truncate(input) {
    if (input.length > 10) {
        return input.substring(0, 10) + '...';
    }
    return input;
};

async function scrapPendingPostData(data, post, keywords) {
    console.log('pending post', post);
    console.log('keywords', keywords);
    
    // Try to find post URL from pending posts structure
    let postURL = findPendingPostURL(post);
    console.log('postURL', postURL);
    
    // If the post URL was already scraped, we don't need to take it.
    if (!postURL || data.config.existingPostURL.includes(postURL)) {
        showInfo("Already processed the url:" + postURL);
        return true;
    }

    let postDate = findPendingPostDate(post);
    console.log('postDate', postDate);

    const text = findPendingPostContent(post);
    showInfo("Processing pending post:" + truncate(text));
    
    let foundKeyword = findKeywordOnText(text, keywords);
    if (foundKeyword == undefined) {
        return true;
    }
    
    showInfo("Processing pending post:" + truncate(text) + "!\n Found key word:" + foundKeyword);

    let postData = new Object();
    postData['postDate'] = postDate;
    postData['wordFound'] = foundKeyword;
    postData['content'] = text;
    postData['url'] = postURL;
    postData['writer'] = findPendingPostWriter(post);
    postData['groupName'] = groupName;
    postData['status'] = 'pending'; // Mark as pending post
    log('pending post', postData);

    numberOfRowOnGGSheets = numberOfRowOnGGSheets + 1;
    data.config.rowIndex = numberOfRowOnGGSheets;
    data.config.existingPostURL.push(postURL);
    console.log('sendToSheets', data.config);
    chrome.runtime.sendMessage({action: "sendToSheets", config: data.config, postData: postData});
    return true;
}

function findPendingPostURL(post) {
    // Try different selectors for pending posts URLs
    let linkElement = post.querySelector('[href*="/pending_posts/"]');
    if (!linkElement) {
        linkElement = post.querySelector('[href*="/posts/"]');
    }
    if (!linkElement) {
        linkElement = post.querySelector('[href*="/permalink/"]');
    }
    if (!linkElement) {
        linkElement = post.querySelector('a[href*="facebook.com"]');
    }
    
    if (linkElement) {
        let url = linkElement.href;
        // Convert pending_posts URL to regular posts URL for consistency
        url = url.replace('/pending_posts/', '/posts/');
        return buildPostPermalink(url);
    }
    
    // Generate a unique identifier if no URL found
    return 'pending-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function findPendingPostContent(post) {
    // Try different selectors for pending post content
    let contentElement = post.querySelector('[data-testid="post_message"]');
    if (contentElement && contentElement.innerText.trim()) {
        return contentElement.innerText;
    }
    
    contentElement = post.querySelector('.userContent');
    if (contentElement && contentElement.innerText.trim()) {
        return contentElement.innerText;
    }
    
    contentElement = post.querySelector('[dir="auto"]');
    if (contentElement && contentElement.innerText.trim()) {
        return contentElement.innerText;
    }
    
    // Look for text in any div inside the post
    const textDivs = post.querySelectorAll('div');
    for (let div of textDivs) {
        if (div.children.length === 0 && div.innerText.trim().length > 10) {
            return div.innerText;
        }
    }
    
    // Look for spans with meaningful text
    const spans = post.querySelectorAll('span');
    let longestText = '';
    for (let span of spans) {
        if (span.children.length === 0 && span.innerText.trim().length > longestText.length) {
            longestText = span.innerText.trim();
        }
    }
    
    if (longestText.length > 10) {
        return longestText;
    }
    
    // Get all text content as fallback
    return post.innerText || '';
}

function findPendingPostWriter(post) {
    // Try different selectors for pending post author
    let authorElement = post.querySelector('[data-testid="post_author_name"]');
    if (authorElement && authorElement.innerText.trim()) {
        return authorElement.innerText;
    }
    
    authorElement = post.querySelector('strong a');
    if (authorElement && authorElement.innerText.trim()) {
        return authorElement.innerText;
    }
    
    authorElement = post.querySelector('h3 a');
    if (authorElement && authorElement.innerText.trim()) {
        return authorElement.innerText;
    }
    
    authorElement = post.querySelector('h4 a');
    if (authorElement && authorElement.innerText.trim()) {
        return authorElement.innerText;
    }
    
    // Look for any link that looks like a name
    const links = post.querySelectorAll('a');
    for (let link of links) {
        const text = link.innerText.trim();
        if (text && !text.includes('http') && !text.includes('www') && text.length > 2 && text.length < 50) {
            // Skip common button texts
            if (!text.toLowerCase().includes('approve') && !text.toLowerCase().includes('decline') && 
                !text.toLowerCase().includes('see more') && !text.toLowerCase().includes('view')) {
                return text;
            }
        }
    }
    
    // Look for strong elements that might contain names
    const strongElements = post.querySelectorAll('strong');
    for (let strong of strongElements) {
        const text = strong.innerText.trim();
        if (text && text.length > 2 && text.length < 50 && !text.includes('·')) {
            return text;
        }
    }
    
    return 'Unknown';
}

function findPendingPostDate(post) {
    // Try different selectors for pending post date
    let dateElement = post.querySelector('[data-testid="story-subtitle"] a');
    if (!dateElement) {
        dateElement = post.querySelector('abbr');
    }
    if (!dateElement) {
        dateElement = post.querySelector('[title*="202"]'); // Look for year in title
    }
    
    if (dateElement) {
        return dateElement.innerText || dateElement.title || '';
    }
    
    return new Date().toLocaleDateString();
}

/**
 * Build post permarlink from a url
 * for example: https://mbasic.facebook.com/groups/dotatradecommunity/permalink/2783825861917691/
 * @param url
 */
function buildPostPermalink(url) {
    return url.split('?')[0].replace('mbasic.', 'www.');
}

/**
 * Return found keyword
 * @param text
 * @param keywords
 */
function findKeywordOnText(text, keywords) {
    for (let keyword of keywords) {
        keyword = keyword.trim();
        console.log('keyword', keyword);
        // and condition
        if (keyword.indexOf("+") > -1) {
            const findWords = keyword.split("+");
            const found = findWords.every(word => findWordInText(word, text))
            if (found) {
                return keyword;
            }
        }

        // normal case
        if (findWordInText(keyword, text)) {
            return keyword;
        }
    }
    return undefined;
}

function findWordInText(word, text) {
    let findWord = word.trim();
    if (findWord.indexOf('"') > -1) {
        // find exact
        let words = text.replace( /\n/g," ").split(" ");
        console.log('words', words);
        findWord = findWord.replaceAll('"', "");
        if (words.includes(findWord)) {
            return true;
        }
    } else {
        return text.indexOf(findWord) > -1;
    }
    return false;
}

// ---- Common functions -----
function log(text, ...restArgs) {
    if (DEBUG) {
        if (typeof consoleLogTime !== 'undefined') {
            consoleLogTime(text, restArgs);
        } else {
            console.log(text, restArgs);
        }
    }
}

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const ERROR_TITLE = "Temporarily Blocked";
function isErrorPage() {
    const title = document.querySelector('title').innerText;
    console.log('title', title);
    if (title.indexOf(ERROR_TITLE) > -1) {
        return true;
    }
    return false;
}

const BLOCK_TEXT = 'The page you requested cannot be displayed right now';
function isBlockPage() {
    let objectContainer = document.querySelector('#objects_container');
    if (objectContainer) {
        const text = objectContainer.innerText;
        if (text.indexOf(BLOCK_TEXT) > -1) {
            return true;
        }
    }

    // Don't consider pending posts page as blocked just because no posts found
    // The readPendingPosts function will handle that case properly
    return false;
}
