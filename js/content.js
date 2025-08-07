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

// Only show indicator when actively running (not on every pending page)
// The indicator will be shown when the extension is actually activated

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
    
    // Show that the extension is actively working on this specific group
    showInfo(`Pending Posts Scanner is actively scanning group: ${groupName}`);
    
    // Reset post counter for this new run
    window.currentRunPostCount = 0;
    console.log('🔄 Reset post counter for new run');
    
    // Initialize processed posts tracking if not exists
    if (!window.processedPosts) {
        window.processedPosts = new Set();
    }
    
    // Initialize scroll counter to prevent infinite scrolling
    if (!window.scrollCount) {
        window.scrollCount = 0;
    }
    
    console.log('Already processed posts:', window.processedPosts.size);
    console.log('Scroll attempts:', window.scrollCount);
    console.log('Current run post count:', window.currentRunPostCount);
    
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
        console.log('Searching for actual pending posts...');
        
        // First, try to find the main content area where posts would be
        const mainContentAreas = [
            document.querySelector('[role="main"]'),
            document.querySelector('[data-pagelet="GroupPendingPostsFeed"]'),
            document.querySelector('[aria-label*="feed" i]'),
            document.body // fallback to search entire page
        ].filter(Boolean);
        
        console.log('Found main content areas:', mainContentAreas.length);
        
        const potentialPosts = [];
        
        for (let contentArea of mainContentAreas) {
            // Look specifically for the blue "Approve" buttons that are actual post actions
            const approveButtons = contentArea.querySelectorAll('div[role="button"], button, [aria-label*="Approve"], [aria-label*="אישור"]');
            
            console.log('Found buttons in content area:', approveButtons.length);
            
            const actualApproveButtons = Array.from(approveButtons).filter(button => {
                const text = button.textContent?.toLowerCase() || '';
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                
                // Look for actual approve buttons (not menu items)
                return (text.includes('approve') || ariaLabel.includes('approve') || 
                        text.includes('אישור') || ariaLabel.includes('אישור')) &&
                       // Exclude navigation/menu items
                       !text.includes('admin') && !text.includes('manage') && 
                       !text.includes('community') && !text.includes('tools') &&
                       !ariaLabel.includes('navigation') && !ariaLabel.includes('menu');
            });
            
            console.log('Found actual approve buttons:', actualApproveButtons.length);
            
            // For each actual approve button, find its post container
            for (let button of actualApproveButtons) {
                let parent = button.parentElement;
                let attempts = 0;
                
                // Go up the DOM tree to find the post container
                while (parent && attempts < 12) { // Increased from 8 to 12
                    // Skip if we've gone too far up
                    if (parent.tagName.toLowerCase() === 'html' || 
                        parent.tagName.toLowerCase() === 'body') {
                        break;
                    }
                    
                    const parentText = parent.innerText;
                    
                    // Check if this looks like a post container - be more specific
                    if (parentText && 
                        parentText.length > 50 && // Must have meaningful content
                        parentText.length < 3000 &&
                        (parentText.includes('Approve') || parentText.includes('אישור')) && 
                        (parentText.includes('Decline') || parentText.includes('דחייה'))) {
                        
                        // Make sure it's not navigation/admin content or page header
                        const lowerText = parentText.toLowerCase();
                        if (lowerText.includes('admin tools') || 
                            lowerText.includes('community home') ||
                            lowerText.includes('manage discussions') ||
                            lowerText.includes('group settings') ||
                            lowerText.includes('badge requests') ||
                            lowerText.includes('potential spam') ||
                            lowerText.includes('scheduled posts') ||
                            lowerText.includes('pending posts ·') || // Skip page header
                            lowerText.startsWith('pending posts')) { // Skip page title
                            break; // This is admin navigation or page header, not a post
                        }
                        
                        // Look for actual post content indicators - must have real content
                        const lines = parentText.split('\n').filter(line => line.trim().length > 0);
                        
                        // Check for author name pattern (common in Facebook posts)
                        const hasAuthor = lines.some(line => {
                            const trimmed = line.trim();
                            // Look for lines that could be author names
                            return trimmed.length > 3 && 
                                   trimmed.length < 50 &&
                                   !trimmed.includes('Approve') && 
                                   !trimmed.includes('Decline') &&
                                   !trimmed.includes('Send') &&
                                   !trimmed.includes('Admin') &&
                                   !trimmed.includes('Community') &&
                                   !trimmed.includes('Pending posts') &&
                                   !trimmed.match(/^\d+\s*[·•]\s*\d*$/) && // Skip "7 · " patterns
                                   !trimmed.match(/^\d+[mhd]$/i); // Skip time patterns
                        });
                        
                        // Check for meaningful post content (not just UI elements)
                        const hasRealContent = lines.some(line => {
                            const trimmed = line.trim();
                            return trimmed.length > 8 && // Meaningful content length
                                   !trimmed.includes('Approve') && 
                                   !trimmed.includes('Decline') &&
                                   !trimmed.includes('אישור') &&
                                   !trimmed.includes('דחייה') &&
                                   !trimmed.includes('Send') &&
                                   !trimmed.includes('Admin') &&
                                   !trimmed.includes('Community') &&
                                   !trimmed.includes('Pending posts') &&
                                   !trimmed.includes('Manage') &&
                                   !trimmed.match(/^\d+\s*[·•]\s*\d*$/) && // Skip "7 · " patterns
                                   !trimmed.match(/^\d+[mhd]$/i) && // Skip time patterns
                                   !trimmed.match(/^[·•]\s*\d+$/); // Skip "· 7" patterns
                        });
                        
                        if ((hasAuthor || hasRealContent) && lines.length > 4) { // Must have author OR content AND enough lines
                            // Make sure we don't add duplicates
                            const isDuplicate = potentialPosts.some(existingPost => 
                                existingPost.contains(parent) || parent.contains(existingPost)
                            );
                            
                            if (!isDuplicate) {
                                console.log('Found potential real pending post #' + (potentialPosts.length + 1));
                                console.log('Post content preview:', parentText.substring(0, 200));
                                potentialPosts.push(parent);
                                break;
                            }
                        }
                    }
                    
                    parent = parent.parentElement;
                    attempts++;
                }
            }
        }
        
        // If we still don't have posts, try a different approach - look for typical post structures
        if (potentialPosts.length === 0) {
            console.log('No posts found via approve buttons, trying structural approach...');
            
            // Look for div structures that typically contain posts
            const possiblePostContainers = document.querySelectorAll('div[data-testid], div[aria-label], div[role]');
            
            for (let container of possiblePostContainers) {
                const text = container.innerText;
                if (text && 
                    text.length > 100 && 
                    text.length < 1500 &&
                    text.includes('Approve') && 
                    text.includes('Decline') &&
                    // Make sure it's not admin UI
                    !text.includes('Admin tools') &&
                    !text.includes('Community home') &&
                    !text.includes('Group settings') &&
                    !text.includes('Badge requests')) {
                    
                    console.log('Found potential post via structural search');
                    console.log('Content preview:', text.substring(0, 150));
                    potentialPosts.push(container);
                }
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

    console.log(`=== FINISHED PROCESSING ${posts.length} PENDING POSTS ===`);

    // Limit the number of scroll attempts to prevent infinite loops
    if (window.scrollCount >= 5) {
        console.log('Maximum scroll attempts reached, stopping scan');
        console.log('Total processed posts in this session:', window.processedPosts ? window.processedPosts.size : 0);
        showInfo(`Scan completed - reached max scrolls. Processed ${window.processedPosts ? window.processedPosts.size : 0} posts`);
        
        // Reset scroll counter for next group
        window.scrollCount = 0;
        
        console.log('Finished processing all pending posts in this group');
        chrome.runtime.sendMessage({
            action: "bg-continue-next-group",
            config: data.config
        });
        return;
    }

    // Try scrolling down to load more content
    console.log('Scrolling down to load more content...');
    window.scrollCount++;
    const scrollHeight = document.body.scrollHeight;
    window.scrollTo(0, scrollHeight);
    
    // Wait for potential lazy loading
    await sleep(2000);
    
    // Check if new content was loaded by comparing scroll height
    const newScrollHeight = document.body.scrollHeight;
    if (newScrollHeight > scrollHeight) {
        console.log('New content loaded after scrolling, scanning again...');
        showInfo('New content found, scanning...');
        await readPendingPosts(data);
        return;
    }

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
        
        // Try final scroll to see if there's more content
        console.log('Trying final scroll to check for more content...');
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(1500);
        
        const finalScrollHeight = document.body.scrollHeight;
        if (finalScrollHeight > newScrollHeight) {
            console.log('Additional content found after final scroll, scanning again...');
            showInfo('Additional content found, scanning...');
            await readPendingPosts(data);
            return;
        }
        
        console.log('No more content available - scanning complete');
        console.log('Total processed posts in this session:', window.processedPosts ? window.processedPosts.size : 0);
        showInfo(`Pending posts scan completed - processed ${window.processedPosts ? window.processedPosts.size : 0} posts`);
    }
    
    console.log('Finished processing all pending posts in this group');
    console.log('Total processed posts in this session:', window.processedPosts ? window.processedPosts.size : 0);
    showInfo(`Finished processing pending posts - total: ${window.processedPosts ? window.processedPosts.size : 0}, go to next group!`);
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

function generatePostId(postElement) {
    // Try to find a unique identifier for the post using multiple approaches
    
    // Method 1: Look for unique data attributes or IDs
    const dataId = postElement.getAttribute('data-id') || 
                   postElement.getAttribute('id') || 
                   postElement.querySelector('[data-id]')?.getAttribute('data-id');
    if (dataId) {
        return dataId;
    }
    
    // Method 2: Use position in DOM
    const siblings = Array.from(postElement.parentElement?.children || []);
    const position = siblings.indexOf(postElement);
    
    // Method 3: Extract meaningful text content (skip repeated "Facebook" words)
    const textContent = postElement.innerText || postElement.textContent || '';
    const lines = textContent.split('\n').filter(line => 
        line.trim() && 
        line.trim() !== 'Facebook' && 
        !line.includes('Facebook Facebook Facebook')
    );
    
    // Get first meaningful line
    const meaningfulText = lines.slice(0, 3).join(' ').trim();
    
    if (meaningfulText && meaningfulText.length > 5) {
        // Create hash from meaningful text + position
        const cleanText = meaningfulText.replace(/[^\w\s\u0590-\u05FF]/gi, '').replace(/\s+/g, '_');
        const uniqueId = `${cleanText.substring(0, 30)}_pos${position}_${Date.now()}`;
        return uniqueId;
    }
    
    // Fallback: timestamp + position + random
    return `post_${position}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function scrapPendingPostData(data, post, keywords) {
    console.log('=== PROCESSING PENDING POST ===');
    console.log('post element:', post);
    console.log('keywords to search:', keywords);
    
    // Generate a unique identifier for this post
    const postId = generatePostId(post);
    console.log('Generated post ID:', postId);
    
    // Check if we already processed this post
    if (window.processedPosts && window.processedPosts.has(postId)) {
        console.log('Post already processed, skipping:', postId);
        return null;
    }
    
    // Mark this post as being processed (add it immediately to avoid re-processing)
    if (window.processedPosts) {
        window.processedPosts.add(postId);
        console.log('Marked post as processed:', postId);
    }
    
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
    
    // Auto approve/decline feature for test group
    const currentGroupName = data.config.groupsConfig['group-name-' + groupIndex];
    console.log('🔍 Checking auto-approve condition for group:', currentGroupName);
    
    // Increment local post counter for this run
    window.currentRunPostCount = (window.currentRunPostCount || 0) + 1;
    
    // Check if auto-approve is enabled and this is the test group
    if (data.config['auto-approve-enabled'] && (currentGroupName === 'test-group' || currentGroupName === 'טסט')) {
        console.log('🤖 AUTO-APPROVE ENABLED for group:', currentGroupName);
        console.log('📊 Using OpenAI-based decision making');
        await handleOpenAIAutoApprove(post, postData, data.config);
    } else {
        console.log('⏭️ Auto-approve disabled or not test group. Enabled:', data.config['auto-approve-enabled'], 'Group:', currentGroupName);
    }
    
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
    
    // Debug: Log all text content to understand the structure
    console.log('=== DEBUG: ALL TEXT CONTENT ===');
    const allText = post.innerText || post.textContent || '';
    console.log('Full post text:', allText.substring(0, 200));
    
    // Log all text lines for debugging
    const allLines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    console.log('All text lines:', allLines);
    
    // Check if this is ONLY a UI navigation element with no real content
    const isPageHeader = allText.includes('Pending posts') && 
                        allText.includes('Approve') && 
                        allText.includes('Decline') && 
                        allText.length < 100 && 
                        !allLines.some(line => line.length > 15 && 
                                              !line.includes('Pending posts') && 
                                              !line.includes('Approve') && 
                                              !line.includes('Decline') &&
                                              !line.match(/^\d+\s*[·•]\s*\d*$/) &&
                                              !line.match(/^[·•]\s*\d+$/));
    
    if (isPageHeader) {
        console.log('This appears to be a page header UI element with no content');
        return 'No post content found';
    }
    
    // Try different selectors for pending post content
    let contentElement = post.querySelector('[data-testid="post_message"]');
    if (contentElement && contentElement.innerText.trim()) {
        console.log('Found content via post_message selector');
        return contentElement.innerText.trim();
    }
    
    contentElement = post.querySelector('.userContent');
    if (contentElement && contentElement.innerText.trim()) {
        console.log('Found content via userContent selector');
        return contentElement.innerText.trim();
    }
    
    // Look for actual post content by analyzing structure
    console.log('=== ANALYZING POST STRUCTURE FOR CONTENT ===');
    
    // Filter out UI lines and find content
    const filteredLines = allLines.filter(line => {
        const trimmed = line.trim();
        
        // Skip UI elements
        if (trimmed === 'Approve' || trimmed === 'Decline' || 
            trimmed === 'אישור' || trimmed === 'דחיה' ||
            trimmed === 'Send' || trimmed === 'Facebook' ||
            trimmed.includes('Pending posts') ||
            trimmed.match(/^\d+\s*[·•]\s*\d*$/) || // Skip "7 · " patterns
            trimmed.match(/^\d+[mhd]$/i) || // Skip time patterns like "1m"
            trimmed.match(/^[·•]\s*\d+$/)) { // Skip "· 7" patterns
            return false;
        }
        
        // Keep meaningful lines
        return trimmed.length > 2;
    });
    
    console.log('Filtered content lines:', filteredLines);
    
    // Look for the main post content (usually comes after author info)
    let authorLine = '';
    let contentLine = '';
    
    for (let i = 0; i < filteredLines.length; i++) {
        const line = filteredLines[i];
        
        // Skip very short lines
        if (line.length <= 3) continue;
        
        // First substantial line might be author name
        if (!authorLine && line.length > 3 && line.length < 100) {
            authorLine = line;
            console.log('Potential author line:', authorLine);
            continue;
        }
        
        // Next substantial line is likely the content
        if (authorLine && !contentLine && line.length > 3) {
            contentLine = line;
            console.log('Potential content line:', contentLine);
            break;
        }
    }
    
    // Return the content if found
    if (contentLine && contentLine.length > 3) {
        console.log('=== FOUND POST CONTENT ===');
        console.log('Content:', contentLine);
        return contentLine;
    }
    
    // Fallback: look for any meaningful text that's not UI
    for (let line of filteredLines) {
        if (line.length > 5 && 
            !line.includes('·') && 
            !line.match(/^\d+[mhd]$/i)) {
            console.log('=== FALLBACK CONTENT ===');
            console.log('Content:', line);
            return line;
        }
    }
    
    console.log('No post content found after structure analysis');
    return 'No post content found';
}

function findPendingPostWriter(post) {
    console.log('🔍 Looking for post writer...');
    console.log('Post element for writer search:', post.outerHTML.substring(0, 300));
    
    // Get all text lines for analysis
    const allText = post.innerText || post.textContent || '';
    const allLines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    console.log('All lines for writer search:', allLines);
    
    // Try different selectors for pending post author
    let authorElement = post.querySelector('[data-testid="post_author_name"]');
    if (authorElement && authorElement.innerText.trim()) {
        console.log('✅ Found writer via post_author_name:', authorElement.innerText.trim());
        return authorElement.innerText.trim();
    }
    
    // Look for profile links - common pattern in Facebook
    authorElement = post.querySelector('a[href*="/profile.php"], a[href*="facebook.com/"][href*="/"]');
    if (authorElement && authorElement.innerText.trim()) {
        const name = authorElement.innerText.trim();
        if (name.length > 2 && name.length < 50 && !name.includes('http')) {
            console.log('✅ Found writer via profile link:', name);
            return name;
        }
    }
    
    // Look for strong elements with names
    authorElement = post.querySelector('strong a');
    if (authorElement && authorElement.innerText.trim()) {
        const name = authorElement.innerText.trim();
        console.log('✅ Found writer via strong a:', name);
        return name;
    }
    
    // Look for h3, h4 headings with links  
    authorElement = post.querySelector('h3 a, h4 a');
    if (authorElement && authorElement.innerText.trim()) {
        const name = authorElement.innerText.trim();
        console.log('✅ Found writer via heading link:', name);
        return name;
    }
    
    // For pending posts, look for user names in specific structure
    // Try finding the name near user avatar/image
    const userLinks = post.querySelectorAll('a[role="link"]');
    for (let link of userLinks) {
        const text = link.innerText?.trim();
        if (text && text.length > 2 && text.length < 50 && 
            !text.includes('http') && 
            !text.includes('Approve') && 
            !text.includes('Decline') &&
            !text.includes('Send') &&
            !text.includes('Admin') &&
            /^[\u0590-\u05FF\u0020a-zA-Z\s]+$/.test(text)) { // Hebrew/English names only
            console.log('✅ Found writer via user link:', text);
            return text;
        }
    }
    
    // Analyze text structure to find author name
    // In Facebook pending posts, author name usually appears early in the text
    const potentialAuthors = allLines.filter(line => {
        // Skip UI elements
        if (line.includes('Pending posts') || 
            line.includes('Approve') || 
            line.includes('Decline') ||
            line.includes('Send') ||
            line.includes('Admin') ||
            line.includes('·') ||
            line.match(/^\d+[mhd]$/i)) {
            return false;
        }
        
        // Look for lines that could be author names
        return line.length > 3 && 
               line.length < 100 && 
               (/[\u0590-\u05FF]/.test(line) || /^[a-zA-Z\s]+$/.test(line)); // Hebrew or English text
    });
    
    console.log('Potential author candidates:', potentialAuthors);
    
    // The first candidate is most likely the author
    if (potentialAuthors.length > 0) {
        const authorName = potentialAuthors[0];
        console.log('✅ Found writer via text analysis:', authorName);
        return authorName;
    }
    
    // Try looking for text elements that could be usernames
    const allTextElements = post.querySelectorAll('span, div');
    for (let element of allTextElements) {
        const text = element.innerText?.trim();
        if (text && text.length > 2 && text.length < 50 && 
            !text.includes('Approve') && 
            !text.includes('Decline') &&
            !text.includes('Send') &&
            !text.includes('Pending posts') &&
            !text.includes('Admin') &&
            !text.includes('·') &&
            !text.match(/^\d+[mhd]$/i) &&
            (/[\u0590-\u05FF]/.test(text) || /^[a-zA-Z\s]+$/.test(text))) {
            
            // Make sure this element doesn't contain multiple lines (probably not a name)
            const elementLines = text.split('\n');
            if (elementLines.length === 1) {
                console.log('✅ Found writer via text element analysis:', text);
                return text;
            }
        }
    }
    
    console.log('❌ No writer found, using default');
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

// Auto approve/decline functionality
async function handleAutoApproveDecline(postElement, postNumber) {
    console.log('🤖 Starting auto approve/decline for post #' + postNumber);
    
    // Alternating logic: odd posts = approve, even posts = decline
    const shouldApprove = (postNumber % 2 === 1);
    const action = shouldApprove ? 'APPROVE' : 'DECLINE';
    
    console.log(`🎯 Post #${postNumber} - Decision: ${action}`);
    showInfo(`Auto ${action}: Post #${postNumber}`);
    
    // Find the approve/decline buttons for this specific post
    const buttons = findApproveDeclineButtons(postElement);
    
    if (!buttons.approve || !buttons.decline) {
        console.log('❌ Could not find approve/decline buttons for this post');
        showInfo('Error: Could not find buttons');
        return false;
    }
    
    console.log('✅ Found buttons:', buttons);
    
    // Wait a bit before clicking (to simulate human behavior)
    await sleep(1000 + Math.random() * 2000); // 1-3 seconds random delay
    
    try {
        if (shouldApprove) {
            console.log('✅ APPROVING post #' + postNumber);
            buttons.approve.click();
            showInfo(`✅ APPROVED Post #${postNumber}`);
        } else {
            console.log('❌ DECLINING post #' + postNumber);
            buttons.decline.click();
            showInfo(`❌ DECLINED Post #${postNumber}`);
        }
        
        // Wait a bit after clicking
        await sleep(1000);
        return true;
        
    } catch (error) {
        console.log('❌ Error clicking button:', error);
        showInfo('Error clicking button: ' + error.message);
        return false;
    }
}

// OpenAI-based auto approve/decline functionality
async function handleOpenAIAutoApprove(postElement, postData, config) {
    console.log('🤖 Starting OpenAI-based auto approve/decline');
    console.log('📝 Post data:', postData);
    
    // Show info to user
    showInfo(`🤖 Waiting for OpenAI decision...`);
    
    // Wait for OpenAI response in Google Sheets column H
    const decision = await waitForOpenAIDecision(postData.url, config);
    
    if (!decision) {
        console.log('⏰ No OpenAI decision received, skipping auto-action');
        showInfo('⏰ OpenAI timeout - no action taken');
        return false;
    }
    
    console.log('🎯 OpenAI Decision:', decision);
    
    // Find the approve/decline buttons for this specific post
    const buttons = findApproveDeclineButtons(postElement);
    
    if (!buttons.approve || !buttons.decline) {
        console.log('❌ Could not find approve/decline buttons for this post');
        showInfo('Error: Could not find buttons');
        return false;
    }
    
    console.log('✅ Found buttons for OpenAI action:', buttons);
    
    // Wait a bit before clicking (to simulate human behavior)
    await sleep(1000 + Math.random() * 2000); // 1-3 seconds random delay
    
    try {
        if (decision === 'YES') {
            console.log('✅ OpenAI says APPROVE - approving post');
            buttons.approve.click();
            showInfo(`✅ OpenAI APPROVED post`);
        } else if (decision === 'NO') {
            console.log('❌ OpenAI says DECLINE - declining post');
            buttons.decline.click();
            showInfo(`❌ OpenAI DECLINED post`);
        } else {
            console.log('⏭️ OpenAI says SKIP - no action taken');
            showInfo(`⏭️ OpenAI SKIPPED post`);
            return true; // Success but no action
        }
        
        // Wait a bit after clicking
        await sleep(1000);
        return true;
        
    } catch (error) {
        console.log('❌ Error clicking button based on OpenAI decision:', error);
        showInfo('Error clicking button: ' + error.message);
        return false;
    }
}

// Wait for OpenAI decision from Web Service
async function waitForOpenAIDecision(postUrl, config, maxWaitTimeMs = 90000) {
    console.log('⏳ Waiting for OpenAI decision from Web Service...');
    console.log('🔍 Post URL:', postUrl);
    
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds (faster than before)
    
    while (Date.now() - startTime < maxWaitTimeMs) {
        try {
            // Read the decision from Google Apps Script Web Service
            const decision = await readOpenAIDecisionFromSheets(postUrl, config);
            
            if (decision && (decision === 'YES' || decision === 'NO' || decision === 'SKIP')) {
                console.log('✅ Found OpenAI decision:', decision);
                return decision;
            }
            
            console.log('⏳ Still waiting for OpenAI decision... elapsed:', Math.round((Date.now() - startTime) / 1000), 'seconds');
            await sleep(checkInterval);
            
        } catch (error) {
            console.log('❌ Error checking OpenAI decision:', error);
            await sleep(checkInterval);
        }
    }
    
    console.log('⏰ Timeout waiting for OpenAI decision after', Math.round(maxWaitTimeMs / 1000), 'seconds');
    return null;
}

// Read OpenAI decision from Google Apps Script Web Service
async function readOpenAIDecisionFromSheets(postUrl, config) {
    try {
        console.log('🌐 Reading OpenAI decision from Web Service for URL:', postUrl);
        
        const webServiceUrl = 'https://script.google.com/macros/s/AKfycbz2qkeOMbSiRQZOwwkhXZdi_6mWxYvFlwUB5rhjoHaIKWYWSL0t2UVxiGKqWs-C8Cnh/exec';
        const requestUrl = `${webServiceUrl}?postUrl=${encodeURIComponent(postUrl)}`;
        
        const response = await fetch(requestUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📥 Web Service response:', data);
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        if (data.found && data.decision) {
            console.log('✅ Found decision from Web Service:', data.decision);
            return data.decision.trim().toUpperCase();
        } else if (data.found && data.waiting) {
            console.log('⏳ Post found but no decision yet');
            return null;
        } else {
            console.log('❌ Post not found in Google Sheets');
            return null;
        }
        
    } catch (error) {
        console.log('❌ Error reading from Web Service:', error);
        return null;
    }
}

function findApproveDeclineButtons(postElement) {
    console.log('🔍 Looking for approve/decline buttons in post element');
    
    // Try different selectors for approve/decline buttons
    const approveSelectors = [
        '[aria-label*="Approve"]',
        '[aria-label*="approve"]',
        '[data-testid*="approve"]',
        'div[role="button"][aria-label*="Approve"]',
        'span[aria-label*="Approve"]'
    ];
    
    const declineSelectors = [
        '[aria-label*="Decline"]',
        '[aria-label*="decline"]',
        '[aria-label*="Delete"]',
        '[aria-label*="Remove"]',
        '[data-testid*="decline"]',
        'div[role="button"][aria-label*="Decline"]',
        'span[aria-label*="Decline"]'
    ];
    
    let approveButton = null;
    let declineButton = null;
    
    // Look for buttons within the post element and nearby
    const searchAreas = [
        postElement,
        postElement.parentElement,
        postElement.parentElement?.parentElement
    ].filter(Boolean);
    
    for (const area of searchAreas) {
        // Try approve selectors
        for (const selector of approveSelectors) {
            try {
                const button = area.querySelector(selector);
                if (button && !approveButton) {
                    approveButton = button;
                    console.log('Found approve button with selector:', selector);
                    break;
                }
            } catch (e) {
                // Ignore selector errors
            }
        }
        
        // Try decline selectors
        for (const selector of declineSelectors) {
            try {
                const button = area.querySelector(selector);
                if (button && !declineButton) {
                    declineButton = button;
                    console.log('Found decline button with selector:', selector);
                    break;
                }
            } catch (e) {
                // Ignore selector errors
            }
        }
        
        if (approveButton && declineButton) break;
    }
    
    // Alternative method: look for all buttons and check their text content
    if (!approveButton || !declineButton) {
        console.log('🔍 Using alternative button detection method');
        
        for (const area of searchAreas) {
            const allButtons = area.querySelectorAll('button, div[role="button"], span[role="button"]');
            
            for (const button of allButtons) {
                const text = button.innerText?.toLowerCase() || '';
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                const allText = text + ' ' + ariaLabel;
                
                if (!approveButton && (allText.includes('approve') || allText.includes('אשר'))) {
                    approveButton = button;
                    console.log('Found approve button by text content:', text || ariaLabel);
                }
                
                if (!declineButton && (allText.includes('decline') || allText.includes('delete') || 
                                     allText.includes('remove') || allText.includes('דחה') || 
                                     allText.includes('מחק'))) {
                    declineButton = button;
                    console.log('Found decline button by text content:', text || ariaLabel);
                }
            }
        }
    }
    
    return {
        approve: approveButton,
        decline: declineButton
    };
}
