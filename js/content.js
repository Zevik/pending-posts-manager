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
        // Look for pending posts in a more targeted way for the new Facebook interface
        const pendingContainer = document.querySelector('[data-pagelet*="PendingPosts"]') || 
                                document.querySelector('[aria-label*="Pending" i]') ||
                                document.querySelector('[role="main"]');
        
        if (pendingContainer) {
            // New approach: Look for any div that contains both post content AND approve/decline buttons
            const potentialPosts = [];
            
            // First, find all buttons with "Approve" text (case insensitive)
            const approveButtons = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.toLowerCase().includes('approve') && 
                el.tagName.toLowerCase() !== 'html' && el.tagName.toLowerCase() !== 'body'
            );
            
            console.log('Found approve buttons:', approveButtons.length);
            
            // For each approve button, find its parent container that looks like a post
            for (let button of approveButtons) {
                let parent = button.parentElement;
                let attempts = 0;
                
                // Go up the DOM tree to find a substantial container, but not too far
                while (parent && attempts < 8) {
                    const parentText = parent.innerText;
                    
                    // Skip if we've gone too far up (html, body elements)
                    if (parent.tagName.toLowerCase() === 'html' || 
                        parent.tagName.toLowerCase() === 'body') {
                        break;
                    }
                    
                    // Check if this parent looks like a post container
                    if (parentText && 
                        parentText.length > 100 && 
                        parentText.length < 3000 &&
                        parentText.includes('Approve') && 
                        parentText.includes('Decline')) {
                        
                        // Make sure it contains meaningful content (not just UI elements)
                        const lines = parentText.split('\n');
                        const contentLines = lines.filter(line => {
                            const trimmed = line.trim();
                            return trimmed.length > 20 && 
                                   !trimmed.includes('Approve') && 
                                   !trimmed.includes('Decline') &&
                                   !trimmed.includes('Send') &&
                                   !trimmed.match(/^\d+[mhd]$/i) && // Skip time stamps
                                   !trimmed.match(/^\d+ .*(ago|hours|minutes|days)/i) && // Skip "5 minutes ago"
                                   !trimmed.includes('·') &&
                                   !trimmed.toLowerCase().includes('communities') &&
                                   !trimmed.toLowerCase().includes('facebook');
                        });
                        
                        if (contentLines.length > 0) {
                            // Make sure we don't add duplicates or nested elements
                            const isDuplicate = potentialPosts.some(existingPost => 
                                existingPost.contains(parent) || parent.contains(existingPost)
                            );
                            
                            if (!isDuplicate) {
                                console.log('Found potential pending post with content lines:', contentLines.length);
                                console.log('Sample content:', contentLines[0]?.substring(0, 100));
                                potentialPosts.push(parent);
                                break; // Found a good container, stop going up
                            }
                        }
                    }
                    
                    parent = parent.parentElement;
                    attempts++;
                }
            }
            
            posts = potentialPosts;
        }
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

    console.log(`=== FINISHED PROCESSING ${posts.length} PENDING POSTS ===`);

    // For pending posts, we typically don't have pagination like regular feed
    // All pending posts are usually loaded on a single page
    // But let's check if there's a "See More" or "Load More" button
    
    console.log('Looking for load more buttons...');
    const loadMoreButtons = document.querySelectorAll('[role="button"]');
    let foundLoadMore = false;
    
    for (let button of loadMoreButtons) {
        const buttonText = button.innerText.toLowerCase();
        if (buttonText.includes('see more') || buttonText.includes('load more') || 
            buttonText.includes('show more') || buttonText.includes('עוד') ||
            buttonText.includes('more')) {
            console.log('Found potential load more button:', button.innerText);
            foundLoadMore = true;
            
            // Try to click it
            try {
                button.click();
                console.log('Clicked load more button');
                showInfo('Loading more pending posts...');
                
                // Wait for new posts to load
                await sleep(3000);
                
                // Recursively call this function to process new posts
                await readPendingPosts(data);
                return;
            } catch (error) {
                console.log('Error clicking load more button:', error);
            }
        }
    }
    
    if (!foundLoadMore) {
        console.log('No load more buttons found');
    }
    
    console.log('Finished processing all pending posts in this group');
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
    console.log('=== PROCESSING PENDING POST ===');
    console.log('post element:', post);
    console.log('keywords to search:', keywords);
    
    // Try to find post URL from pending posts structure
    let postURL = findPendingPostURL(post);
    console.log('postURL found:', postURL);
    
    // If the post URL was already scraped, we don't need to take it.
    if (!postURL || data.config.existingPostURL.includes(postURL)) {
        console.log('Post already processed or no URL found:', postURL);
        showInfo("Already processed the url:" + postURL);
        return true;
    }

    let postDate = findPendingPostDate(post);
    console.log('postDate found:', postDate);

    const text = findPendingPostContent(post);
    console.log('Post content found:', text);
    console.log('Content length:', text.length);
    
    showInfo("Processing pending post:" + truncate(text));
    
    let foundKeyword = findKeywordOnText(text, keywords);
    console.log('Keyword search result:', foundKeyword);
    
    if (foundKeyword == undefined) {
        console.log('No keyword found in this post, skipping');
        return true;
    }
    
    console.log('✅ KEYWORD FOUND:', foundKeyword);
    showInfo("Processing pending post:" + truncate(text) + "!\n Found key word:" + foundKeyword);

    let postData = new Object();
    postData['postDate'] = postDate;
    postData['wordFound'] = foundKeyword;
    postData['content'] = text;
    postData['url'] = postURL;
    postData['writer'] = findPendingPostWriter(post);
    postData['groupName'] = groupName;
    postData['status'] = 'pending'; // Mark as pending post
    
    console.log('Final post data to save:', postData);
    log('pending post', postData);

    numberOfRowOnGGSheets = numberOfRowOnGGSheets + 1;
    data.config.rowIndex = numberOfRowOnGGSheets;
    data.config.existingPostURL.push(postURL);
    console.log('Sending to sheets with config:', data.config);
    chrome.runtime.sendMessage({action: "sendToSheets", config: data.config, postData: postData});
    return true;
}

function findPendingPostURL(post) {
    console.log('Looking for post URL...');
    
    // Try different selectors for pending posts URLs
    let linkElement = post.querySelector('[href*="/pending_posts/"]');
    console.log('Found pending_posts link:', !!linkElement);
    
    if (!linkElement) {
        linkElement = post.querySelector('[href*="/posts/"]');
        console.log('Found posts link:', !!linkElement);
    }
    
    if (!linkElement) {
        linkElement = post.querySelector('[href*="/permalink/"]');
        console.log('Found permalink link:', !!linkElement);
    }
    
    if (!linkElement) {
        // Look for any link that points to a specific post
        const allLinks = post.querySelectorAll('a[href]');
        for (let link of allLinks) {
            const href = link.href;
            if (href && (
                href.includes('/groups/') && 
                (href.includes('/posts/') || href.includes('/permalink/') || href.includes('/pending_posts/'))
            )) {
                linkElement = link;
                console.log('Found group post link:', href);
                break;
            }
        }
    }
    
    if (!linkElement) {
        // Look for any link in the post that might be the post URL
        linkElement = post.querySelector('a[href*="facebook.com/groups"]');
        console.log('Found facebook groups link:', !!linkElement);
    }
    
    if (linkElement) {
        let url = linkElement.href;
        console.log('Original URL found:', url);
        
        // Convert pending_posts URL to regular posts URL for consistency
        url = url.replace('/pending_posts/', '/posts/');
        console.log('Processed URL:', url);
        
        return buildPostPermalink(url);
    }
    
    // Try to construct a URL from the current page and look for post ID
    const currentUrl = window.location.href;
    const groupMatch = currentUrl.match(/groups\/(\d+)/);
    
    if (groupMatch) {
        const groupId = groupMatch[1];
        // Look for any element that might contain a post ID
        const possibleIds = post.querySelectorAll('[id*="feed_story"], [data-testid*="story"], [aria-describedby]');
        
        for (let element of possibleIds) {
            const id = element.id || element.getAttribute('aria-describedby') || element.getAttribute('data-testid');
            if (id && id.includes('_')) {
                const postId = id.split('_').pop();
                if (postId && postId.length > 5) {
                    const constructedUrl = `https://www.facebook.com/groups/${groupId}/posts/${postId}/`;
                    console.log('Constructed URL from ID:', constructedUrl);
                    return constructedUrl;
                }
            }
        }
    }
    
    // Generate a unique identifier if no URL found
    const uniqueId = 'pending-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    console.log('No URL found, generating unique ID:', uniqueId);
    return uniqueId;
}

function findPendingPostContent(post) {
    console.log('Extracting content from post...');
    
    // Try different selectors for pending post content
    let contentElement = post.querySelector('[data-testid="post_message"]');
    if (contentElement && contentElement.innerText.trim()) {
        console.log('Found content via post_message selector');
        return contentElement.innerText;
    }
    
    contentElement = post.querySelector('.userContent');
    if (contentElement && contentElement.innerText.trim()) {
        console.log('Found content via userContent selector');
        return contentElement.innerText;
    }
    
    // Look for text in divs, but exclude UI elements - improved logic
    const textDivs = post.querySelectorAll('div');
    let candidates = [];
    
    for (let div of textDivs) {
        const text = div.innerText.trim();
        
        // Skip if it's UI text or too short/long
        if (text.length < 15 || text.length > 2000) continue;
        if (text.includes('Approve') || text.includes('Decline')) continue;
        if (text.includes('אישור') || text.includes('דחיה')) continue;
        if (text.includes('Send') || text.includes('Hide')) continue;
        if (text.includes('See More') || text.includes('Show less')) continue;
        if (text.match(/^\d+[mhd]$/)) continue; // Skip timestamps like "1m", "2h"
        if (text.match(/^\d+ .*ago$/)) continue; // Skip "5 minutes ago" etc
        if (text.toLowerCase().includes('communities')) continue; // Skip Facebook UI
        if (text.toLowerCase().includes('facebook')) continue; // Skip Facebook UI
        if (text.includes('·')) continue; // Skip UI elements with dots
        
        // Check if this div is likely the main content (not nested deep with many children)
        if (div.children.length <= 3) {
            candidates.push({
                element: div,
                text: text,
                length: text.length
            });
        }
    }
    
    // Sort by length and pick the longest meaningful text
    candidates.sort((a, b) => b.length - a.length);
    
    if (candidates.length > 0) {
        console.log('Found content via div analysis, candidates:', candidates.length);
        console.log('Selected content length:', candidates[0].length);
        console.log('Selected content preview:', candidates[0].text.substring(0, 100));
        return candidates[0].text;
    }
    
    // Look for the main text content - usually in a div with dir="auto"
    const dirAutoElements = post.querySelectorAll('[dir="auto"]');
    for (let element of dirAutoElements) {
        const text = element.innerText.trim();
        if (text && text.length > 15 && 
            !text.includes('Approve') && 
            !text.includes('Decline') &&
            !text.includes('Send') &&
            !text.toLowerCase().includes('communities') &&
            !text.toLowerCase().includes('facebook') &&
            !text.match(/^\d+[mhd]$/)) {
            console.log('Found content via dir="auto" selector');
            return text;
        }
    }
    
    // Look for spans with meaningful text (but not UI elements)
    const spans = post.querySelectorAll('span');
    let longestText = '';
    for (let span of spans) {
        const text = span.innerText.trim();
        if (text.length > 15 && text.length > longestText.length &&
            !text.includes('Approve') && !text.includes('Decline') &&
            !text.includes('אישור') && !text.includes('דחיה') &&
            !text.includes('Send') && !text.match(/^\d+[mhd]$/) &&
            !text.toLowerCase().includes('communities') &&
            !text.toLowerCase().includes('facebook') &&
            span.children.length === 0) {
            longestText = text;
        }
    }
    
    if (longestText.length > 15) {
        console.log('Found content via span analysis');
        return longestText;
    }
    
    // Get all text content as fallback, but try to clean it
    const fullText = post.innerText || '';
    const lines = fullText.split('\n');
    const filteredLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 10 && 
               !trimmed.includes('Approve') && !trimmed.includes('Decline') &&
               !trimmed.includes('אישור') && !trimmed.includes('דחיה') &&
               !trimmed.includes('Send') && !trimmed.match(/^\d+[mhd]$/) &&
               !trimmed.includes('·') && !trimmed.includes('hrs') && !trimmed.includes('min') &&
               !trimmed.toLowerCase().includes('communities') &&
               !trimmed.toLowerCase().includes('facebook');
    });
    
    const cleanedText = filteredLines.slice(0, 5).join(' ').trim(); // Take only first 5 relevant lines
    console.log('Using fallback content extraction, length:', cleanedText.length);
    return cleanedText;
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
    console.log('=== SEARCHING FOR KEYWORDS ===');
    console.log('Text to search in:', text);
    console.log('Keywords array:', keywords);
    
    for (let i = 0; i < keywords.length; i++) {
        let keyword = keywords[i].trim();
        console.log(`Checking keyword ${i+1}/${keywords.length}: "${keyword}"`);
        
        // and condition
        if (keyword.indexOf("+") > -1) {
            console.log('Processing AND condition (+)');
            const findWords = keyword.split("+");
            console.log('Words to find (all required):', findWords);
            const found = findWords.every(word => {
                const wordFound = findWordInText(word, text);
                console.log(`  Word "${word}" found: ${wordFound}`);
                return wordFound;
            });
            if (found) {
                console.log('✅ AND condition matched:', keyword);
                return keyword;
            }
        } else {
            // normal case
            console.log('Processing normal keyword search');
            const found = findWordInText(keyword, text);
            console.log(`Word "${keyword}" found: ${found}`);
            if (found) {
                console.log('✅ Keyword matched:', keyword);
                return keyword;
            }
        }
    }
    console.log('❌ No keywords found in text');
    return undefined;
}

function findWordInText(word, text) {
    let findWord = word.trim();
    console.log(`  Searching for: "${findWord}" in text`);
    
    // Check for wildcard (stars) - should match all posts
    if (findWord === '*' || findWord === '**' || findWord === '***' || findWord === '****' || findWord === '*****' || findWord === '******') {
        console.log('  Using wildcard search (stars detected) - matches all posts');
        return true;
    }
    
    if (findWord.indexOf('"') > -1) {
        // find exact phrase
        console.log('  Using exact phrase search (quotes detected)');
        let words = text.replace(/\n/g," ").split(" ");
        console.log('  Text split into words:', words.length, 'words');
        findWord = findWord.replaceAll('"', "");
        console.log(`  Looking for exact word: "${findWord}"`);
        const found = words.includes(findWord);
        console.log(`  Exact word found: ${found}`);
        return found;
    } else {
        // find substring (case insensitive)
        console.log('  Using substring search (case insensitive)');
        const textLower = text.toLowerCase();
        const findWordLower = findWord.toLowerCase();
        const found = textLower.indexOf(findWordLower) > -1;
        console.log(`  Substring "${findWordLower}" found: ${found}`);
        return found;
    }
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
