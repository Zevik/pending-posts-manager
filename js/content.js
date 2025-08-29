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

async function readPendingPosts(data, isRecursiveCall = false) {
    groupIndex = data.config['currGroupIndex'];
    groupName = data.config.groupsConfig['group-name-' + groupIndex];
    keywords = data.config.groupsConfig["keywords-" + groupIndex].split(',');

    console.log('=== STARTING PENDING POSTS SCAN ===');
    console.log('Group Index:', groupIndex);
    console.log('Group Name:', groupName);
    console.log('Keywords:', keywords);
    console.log('Current URL:', window.location.href);
    console.log('Is recursive call:', isRecursiveCall);
    
    // Show that the extension is actively working on this specific group
    showInfo(`Pending Posts Scanner is actively scanning group: ${groupName}`);
    
    // Reset all counters and tracking ONLY for the first call, not recursive calls
    if (!isRecursiveCall) {
        window.currentRunPostCount = 0;
        window.processedPosts = new Set(); // Reset processed posts only for new group
        window.scrollCount = 0; // Reset scroll counter only for new group
        
        console.log('🔄 Reset all counters for new group scan (first call)');
    } else {
        console.log('📝 Continuing scan (recursive call) - keeping existing processed posts');
    }
    
    console.log('Processed posts count:', window.processedPosts.size);
    console.log('Scroll attempts:', window.scrollCount);
    console.log('Current run post count:', window.currentRunPostCount);
    
    // Wait a bit for page to fully load
    console.log('⏳ Waiting for page to fully load...');
    await sleep(3000); // Increased from 2000
    
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
        // Skip async content extraction in debug to avoid blocking
        console.log('Ready to process', posts.length, 'posts');
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
            } else {
                showInfo("Pending posts page loaded but no posts found. Moving to next group.");
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

    // SIMPLIFIED: Process only the first post, then recurse
    console.log(`📍 Processing first post only (total ${posts.length} posts visible)`);
    
    const firstPost = posts[0];
    
    try {
        console.log(`\n=== PROCESSING FIRST POST ===`);
        showInfo(`Processing pending post...`);
        
        // First, expand "See More" for this specific post and wait
        console.log(`📖 Step 1: Expanding "See More"...`);
        const expanded = await expandSeeMore(firstPost);
        
        if (expanded) {
            console.log(`✅ Successfully expanded post, waiting for content to load...`);
            await sleep(2000); // Wait for expansion to complete
        } else {
            console.log(`ℹ️ No "See More" found or already expanded`);
            await sleep(500); // Short wait even if no expansion needed
        }
        
        // Wait a bit more before processing content
        console.log(`⏳ Step 2: Waiting before processing content...`);
        await sleep(1000);
        
        // Now process the post data
        console.log(`📝 Step 3: Processing post data...`);
        await scrapPendingPostData(data, firstPost, keywords);
        
        // Wait after processing
        const delayTime = data.config["interval-post"] * 1000;
        const randomDelayTime = delayTime + delayTime / 100 * getRandomInt(15, 25);
        
        console.log(`⏱️ Step 4: Waiting ${Math.round(randomDelayTime/1000)}s before checking for next post...`);
        showInfo(`Post processed. Checking for more posts...`);
        await sleep(randomDelayTime);
        
        // After processing first post, check for more posts (recursive call)
        console.log('🔄 Checking for more pending posts after processing...');
        await readPendingPosts(data, true); // Recursive call to check for more posts
        return;
        
    } catch (error) {
        console.log(`❌ Error processing post:`, error);
        showInfo(`Error processing post, continuing...`);
        // Continue anyway - try again after a delay
        await sleep(3000);
        await readPendingPosts(data, true); // Try again
        return;
    }

    // If we reach here, it means no posts found or all processing is complete
    console.log('📄 No more posts found - moving to next group');
    console.log('Total processed posts in this session:', window.processedPosts ? window.processedPosts.size : 0);
    showInfo(`All pending posts processed - total: ${window.processedPosts ? window.processedPosts.size : 0}`);
    
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
    console.log('🆔 Generating stable post ID...');
    
    // Method 1: Look for unique data attributes or IDs (most reliable)
    const dataId = postElement.getAttribute('data-id') || 
                   postElement.getAttribute('id') || 
                   postElement.querySelector('[data-id]')?.getAttribute('data-id');
    if (dataId) {
        console.log('✅ Found data-id:', dataId);
        return `dataid_${dataId}`;
    }
    
    // Method 2: Look for Facebook-specific IDs in the DOM structure
    const elementsWithIds = postElement.querySelectorAll('[id]');
    const fbIds = Array.from(elementsWithIds)
        .map(el => el.id)
        .filter(id => id && id.length > 5 && id.match(/\d{8,}/)) // Look for long numeric IDs
        .slice(0, 2); // Take first 2 IDs
    
    if (fbIds.length > 0) {
        const stableId = `fbid_${fbIds.join('_')}`;
        console.log('✅ Generated ID from Facebook elements:', stableId);
        return stableId;
    }
    
    // Method 3: Create stable hash from content + DOM position
    const textContent = postElement.innerText || postElement.textContent || '';
    
    // Extract the first few meaningful lines (skip UI elements)
    const meaningfulLines = textContent.split('\n')
        .filter(line => {
            const trimmed = line.trim();
            return trimmed && 
                   trimmed.length > 3 &&
                   trimmed !== 'Facebook' &&
                   !trimmed.includes('Approve') &&
                   !trimmed.includes('Decline') &&
                   !trimmed.includes('Send') &&
                   !trimmed.match(/^\d+[mhd]$/i) &&
                   !trimmed.match(/^[·•]\s*\d+$/);
        })
        .slice(0, 3); // Take first 3 meaningful lines
    
    // Get stable position in DOM
    const siblings = Array.from(postElement.parentElement?.children || []);
    const position = siblings.indexOf(postElement);
    
    if (meaningfulLines.length >= 1) {
        // Use content + position for stable ID (NO timestamps!)
        const contentForId = meaningfulLines.join('|');
        const cleanContent = meaningfulLines[0]
            .replace(/[^\w\s\u0590-\u05FF]/g, '') // Keep only letters, numbers, spaces, Hebrew
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .substring(0, 30); // Limit length
        
        // Create a simple hash for additional uniqueness (stable, no random)
        let contentHash = 0;
        for (let i = 0; i < contentForId.length; i++) {
            contentHash = ((contentHash << 5) - contentHash + contentForId.charCodeAt(i)) & 0xffffffff;
        }
        
        const stableId = `content_${cleanContent}_pos${position}_${Math.abs(contentHash)}`;
        console.log('✅ Generated stable content-based ID:', stableId.substring(0, 50) + '...');
        return stableId;
    }
    
    // Method 4: Position-based ID (as last resort)
    const positionId = `position_${position}_${postElement.tagName || 'div'}`;
    console.log('✅ Generated position-based ID:', positionId);
    return positionId;
}

async function scrapPendingPostData(data, post, keywords) {
    console.log('=== PROCESSING PENDING POST ===');
    console.log('post element:', post);
    console.log('keywords to search:', keywords);
    
    // Generate a unique identifier for this post
    const postId = generatePostId(post);
    console.log('Generated post ID:', postId);
    
    // Check if we already processed this post
    // DISABLED: Skip check to allow reprocessing of all posts
    // if (window.processedPosts && window.processedPosts.has(postId)) {
    //     console.log('Post already processed, skipping:', postId);
    //     return null;
    // }
    
    // Mark this post as being processed (add it immediately to avoid re-processing)
    if (window.processedPosts) {
        window.processedPosts.add(postId);
        console.log('Marked post as processed:', postId);
    }
    
    // Try to find post URL from pending posts structure
    let postURL = findPendingPostURL(post);
    console.log('postURL found:', postURL);
    
    // If the post URL was already scraped, we don't need to take it.
    // DISABLED: Skip URL check to allow reprocessing of all posts
    // if (!postURL || data.config.existingPostURL.includes(postURL)) {
    //     console.log('Post already processed or no URL found:', postURL);
    //     showInfo("Already processed the url:" + postURL);
    //     return true;
    // }
    
    // Still need to check for missing URL (but not for duplicates)
    if (!postURL) {
        console.log('No URL found for post, using generated post ID');
        postURL = postId; // Use the generated post ID as URL for Google Sheets
    }

    let postDate = findPendingPostDate(post);
    console.log('postDate found:', postDate);

    const text = await findPendingPostContent(post);
    console.log('Post content found:', text);
    console.log('Content length:', text.length);
    
    showInfo("Processing pending post:" + truncate(text));
    
    let foundKeyword = findKeywordOnText(text, keywords);
    console.log('Keyword search result:', foundKeyword);
    
    // DISABLED: Process all posts regardless of keywords
    if (foundKeyword == undefined) {
        console.log('No keyword found - processing post anyway');
        foundKeyword = 'ALL_POSTS_PROCESSED'; // Default value for posts without keywords
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
    
    // Auto approve/decline feature - now works for all groups
    const currentGroupName = data.config.groupsConfig['group-name-' + groupIndex];
    console.log('🔍 Checking auto-approve condition for group:', currentGroupName);
    
    // Increment local post counter for this run
    window.currentRunPostCount = (window.currentRunPostCount || 0) + 1;
    
    // Check if auto-approve is enabled for all groups
    if (data.config['auto-approve-enabled']) {
        console.log('🤖 AUTO-APPROVE ENABLED for group:', currentGroupName);
        console.log('📊 Using OpenAI-based decision making');
        await handleOpenAIAutoApprove(post, postData, data.config);
    } else {
        console.log('⏭️ Auto-approve disabled. Enabled:', data.config['auto-approve-enabled'], 'Group:', currentGroupName);
    }
    
    return true;
}

function findPendingPostURL(post) {
    console.log('🔍 Looking for post URL...');
    
    // Debug: Log all links in the post to understand the structure
    if (DEBUG) {
        console.log('=== ALL LINKS IN POST ===');
        const allLinks = post.querySelectorAll('a[href]');
        allLinks.forEach((link, index) => {
            console.log(`Link ${index + 1}:`, link.href);
            console.log(`  Text:`, link.textContent?.trim());
        });
    }
    
    // Method 1: Look for direct post links in the content area
    let foundURL = null;
    
    // First, check all links for proper pending_posts URLs
    const allLinks = post.querySelectorAll('a[href]');
    let linkElement = null;
    
    for (let link of allLinks) {
        const href = link.href;
        if (href && href.includes('/pending_posts/') && href.match(/\/pending_posts\/\d+/)) {
            // This is a real pending post URL with ID
            linkElement = link;
            console.log('Found real pending_posts link with ID:', href);
            break;
        }
    }
    
    // If no pending_posts link found, try posts links
    if (!linkElement) {
        for (let link of allLinks) {
            const href = link.href;
            if (href && href.includes('/posts/') && href.match(/\/posts\/\d+/)) {
                linkElement = link;
                console.log('Found posts link with ID:', href);
                break;
            }
        }
    }
    
    // Try permalink links
    if (!linkElement) {
        for (let link of allLinks) {
            const href = link.href;
            if (href && href.includes('/permalink/') && href.match(/\/permalink\/\d+/)) {
                linkElement = link;
                console.log('Found permalink link with ID:', href);
                break;
            }
        }
    }
    
    console.log('Found pending_posts link:', !!linkElement && linkElement.href?.includes('/pending_posts/'));
    console.log('Found posts link:', !!linkElement && linkElement.href?.includes('/posts/'));
    console.log('Found permalink link:', !!linkElement && linkElement.href?.includes('/permalink/'));
    
    // Method 2: Look for timestamp/date links (these often contain post URLs)
    if (!linkElement) {
        const timeLinks = post.querySelectorAll('a[href]');
        for (let link of timeLinks) {
            const linkText = link.textContent?.trim() || '';
            const href = link.href;
            
            // Look for time/date links that point to posts
            if (href && (
                linkText.includes('h') || linkText.includes('m') || linkText.includes('d') ||
                linkText.includes('·') || linkText.match(/\d+/) ||
                href.includes('/posts/') || href.includes('/permalink/')
            )) {
                if (href.includes('/groups/') && (href.includes('/posts/') || href.includes('/permalink/'))) {
                    linkElement = link;
                    console.log('Found timestamp post link:', href);
                    break;
                }
            }
        }
    }
    
    // Method 3: Look for author name links that might point to the post
    if (!linkElement) {
        const authorLinks = post.querySelectorAll('a[href]');
        for (let link of authorLinks) {
            const href = link.href;
            if (href && href.includes('/groups/') && 
                (href.includes('/posts/') || href.includes('/permalink/') || href.includes('/pending_posts/'))) {
                linkElement = link;
                console.log('Found author post link:', href);
                break;
            }
        }
    }
    
    if (linkElement) {
        let url = linkElement.href;
        console.log('✅ Original URL found:', url);
        
        // Clean up URL - keep original format
        url = url.split('?')[0]; // Remove query parameters
        url = url.replace('mbasic.', 'www.'); // Convert to www
        console.log('✅ Processed URL:', url);
        
        return url;
    }
    
    // Method 4: Try to extract post ID from current URL and DOM elements
    const currentUrl = window.location.href;
    const groupMatch = currentUrl.match(/groups\/(\d+)/);
    
    if (groupMatch) {
        const groupId = groupMatch[1];
        console.log('🔍 Searching for post ID in group:', groupId);
        
        // Enhanced search for post IDs in the DOM
        const allElements = post.querySelectorAll('*');
        const foundIds = new Set();
        
        // First, look for IDs in href attributes of all links
        const postLinks = post.querySelectorAll('a[href]');
        for (let link of postLinks) {
            const href = link.href;
            const linkText = link.textContent?.trim() || '';
            
            // Extract post IDs from URLs
            const pendingMatch = href.match(/\/pending_posts\/(\d+)/);
            if (pendingMatch && pendingMatch[1] !== groupId) {
                foundIds.add(pendingMatch[1]);
                console.log('Found pending post ID in URL:', pendingMatch[1]);
            }
            
            const postMatch = href.match(/\/posts\/(\d+)/);
            if (postMatch && postMatch[1] !== groupId) {
                foundIds.add(postMatch[1]);
                console.log('Found post ID in URL:', postMatch[1]);
            }
            
            const permalinkMatch = href.match(/\/permalink\/(\d+)/);
            if (permalinkMatch && permalinkMatch[1] !== groupId) {
                foundIds.add(permalinkMatch[1]);
                console.log('Found permalink ID in URL:', permalinkMatch[1]);
            }
            
            // NEW: Extract post IDs from link text content
            if (href.includes('/pending_posts') && linkText.length > 10) {
                console.log('Analyzing pending_posts link text for post ID:', linkText);
                
                // Look for 16-digit sequences that match Facebook post ID pattern
                const longNumericMatches = linkText.match(/\d{16}/g);
                if (longNumericMatches) {
                    longNumericMatches.forEach(id => {
                        if (id !== groupId) {
                            foundIds.add(id);
                            console.log('✅ Found 16-digit post ID in link text:', id);
                        }
                    });
                }
                
                // Also look for 15-digit sequences 
                if (foundIds.size === 0) {
                    const numericMatches = linkText.match(/\d{15}/g);
                    if (numericMatches) {
                        numericMatches.forEach(id => {
                            if (id !== groupId) {
                                foundIds.add(id);
                                console.log('✅ Found 15-digit post ID in link text:', id);
                            }
                        });
                    }
                }
                
                // Look for the specific pattern we see: extract all numeric sequences and find the right one
                if (foundIds.size === 0) {
                    const allNumbers = linkText.match(/\d+/g);
                    if (allNumbers) {
                        console.log('All numeric sequences found in link text:', allNumbers);
                        
                        // Look for sequences that are 15+ digits (Facebook post IDs)
                        const validPostIds = allNumbers.filter(num => 
                            num.length >= 15 && num.length <= 19 && num !== groupId
                        );
                        
                        if (validPostIds.length > 0) {
                            const postId = validPostIds[0];
                            foundIds.add(postId);
                            console.log('✅ Found valid post ID from sequences:', postId);
                        }
                    }
                }
            }
        }
        
        // If we found IDs from URLs, use the first one
        if (foundIds.size > 0) {
            const postId = Array.from(foundIds)[0];
            const constructedUrl = `https://www.facebook.com/groups/${groupId}/pending_posts/${postId}/`;
            console.log('✅ Constructed URL from extracted post ID:', constructedUrl);
            return constructedUrl;
        }
        
        // Fallback: Look for long numeric IDs in element attributes
        for (let element of allElements) {
            // Check various attributes for post IDs
            const attrs = ['id', 'data-testid', 'aria-describedby', 'data-id', 'data-ft'];
            for (let attr of attrs) {
                const value = element.getAttribute(attr);
                if (value) {
                    // Look for Facebook-style numeric IDs (15+ digits)
                    const numericMatches = value.match(/\d{15,}/g);
                    if (numericMatches) {
                        numericMatches.forEach(id => {
                            if (id !== groupId && id.length >= 15) { // Must be different from group ID and long enough
                                foundIds.add(id);
                            }
                        });
                    }
                }
            }
        }
        
        if (foundIds.size > 0) {
            // Use the first (hopefully most relevant) post ID found
            const postId = Array.from(foundIds)[0];
            const constructedUrl = `https://www.facebook.com/groups/${groupId}/pending_posts/${postId}/`;
            console.log('✅ Constructed URL from DOM post ID:', constructedUrl);
            console.log('Found post ID:', postId, '(different from group ID:', groupId + ')');
            return constructedUrl;
        }
    }
    
    console.log('❌ No real post URL found, creating content-based identifier...');
    
    // Method 5: Create a stable identifier based on post content and return proper warning
    const postContent = post.innerText || post.textContent || '';
    
    // Extract meaningful lines (not UI elements)
    const meaningfulLines = postContent.split('\n')
        .filter(line => {
            const trimmed = line.trim();
            return trimmed && 
                   trimmed.length > 3 &&
                   !trimmed.includes('Facebook') &&
                   !trimmed.includes('Approve') &&
                   !trimmed.includes('Decline') &&
                   !trimmed.includes('Send') &&
                   !trimmed.match(/^\d+[mhd]$/i) &&
                   !trimmed.match(/^[·•]\s*\d+$/);
        })
        .slice(0, 3); // Take first 3 meaningful lines
    
    if (meaningfulLines.length >= 1) {
        // Create a content-based identifier - but mark it clearly as not a real URL
        const contentSample = meaningfulLines[0]
            .replace(/[^\w\s\u0590-\u05FF]/g, '') // Keep only letters, numbers, spaces, Hebrew
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .substring(0, 30); // Limit length
        
        // Add counter for uniqueness
        if (!window.postUrlCounter) {
            window.postUrlCounter = 0;
        }
        window.postUrlCounter++;
        
        const contentId = `[NO_URL]_content_${contentSample}_${window.postUrlCounter}`;
        console.log('⚠️ Generated content-based placeholder (NOT A URL):', contentId);
        return contentId;
    }
    
    // Last resort: timestamp-based unique ID - but mark it clearly as not a real URL
    if (!window.postUrlCounter) {
        window.postUrlCounter = 0;
    }
    window.postUrlCounter++;
    
    const uniqueId = '[NO_URL]_pending-' + Date.now() + '-' + window.postUrlCounter;
    console.log('⚠️ Generated timestamp-based placeholder (NOT A URL):', uniqueId);
    return uniqueId;
}

async function expandSeeMore(post) {
    try {
        console.log('🔍 Looking for "See more" buttons in post...');
        
        // Look for "See more" buttons in various forms - more comprehensive search
        const seeMoreSelectors = [
            'div[role="button"]',
            'span[role="button"]', 
            '[aria-label*="See more"]',
            '[aria-label*="see more"]',
            '[aria-label*="Show more"]',
            '[aria-label*="show more"]',
            'button',
            '[data-testid*="see-more"]',
            '[data-testid*="expand"]'
        ];
        
        let seeMoreButtons = [];
        
        // Search for buttons using different selectors
        for (const selector of seeMoreSelectors) {
            try {
                const buttons = Array.from(post.querySelectorAll(selector));
                seeMoreButtons = seeMoreButtons.concat(buttons);
            } catch (e) {
                // Ignore selector errors
            }
        }
        
        // Filter buttons by text content (only English)
        const filteredButtons = seeMoreButtons.filter(btn => {
            const text = btn.textContent?.toLowerCase() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            const allText = text + ' ' + ariaLabel;
            
            return allText.includes('see more') || 
                   allText.includes('show more') ||
                   text === '...' || 
                   text.includes('…');
        });
        
        console.log(`Found ${filteredButtons.length} potential "See more" buttons`);
        
        if (filteredButtons.length > 0) {
            // Try clicking the first valid "See more" button
            const button = filteredButtons[0];
            console.log('🖱️ Found "See more" button, attempting to click...');
            console.log('Button text:', button.textContent);
            console.log('Button aria-label:', button.getAttribute('aria-label'));
            
            // Scroll button into view first
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(500); // Wait for scroll
            
            // Try different click methods
            try {
                // Method 1: Regular click
                button.click();
                console.log('✅ Clicked "See more" button using regular click');
            } catch (e) {
                try {
                    // Method 2: Dispatch click event
                    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    console.log('✅ Clicked "See more" button using dispatchEvent');
                } catch (e2) {
                    try {
                        // Method 3: Focus and simulate Enter key
                        button.focus();
                        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                        console.log('✅ Clicked "See more" button using Enter key');
                    } catch (e3) {
                        console.log('❌ All click methods failed:', e3);
                        return false;
                    }
                }
            }
            
            // Wait for content to expand - increased wait time
            console.log('⏳ Waiting for content to expand...');
            await sleep(1500); // Increased from 500
            
            // Verify expansion by checking if button is gone or text changed
            const buttonStillExists = post.contains(button);
            const buttonTextChanged = button.textContent !== filteredButtons[0].textContent;
            
            if (!buttonStillExists || buttonTextChanged) {
                console.log('✅ Content appears to have expanded successfully');
                return true;
            } else {
                console.log('⚠️ Button still exists with same text, expansion may not have worked');
                // Try clicking again
                await sleep(500);
                try {
                    button.click();
                    console.log('🔄 Tried clicking "See more" button again');
                    await sleep(1000);
                    return true;
                } catch (e) {
                    console.log('❌ Second click attempt failed:', e);
                }
            }
            
            return true;
        } else {
            console.log('ℹ️ No "See more" buttons found - content may already be expanded');
            return false;
        }
        
    } catch (err) {
        console.error('❌ Error expanding "See more":', err);
        return false;
    }
}

async function findPendingPostContent(post) {
    console.log('📖 Extracting content from post...');
    
    // First, ensure we expand any "See More" content and wait for it
    console.log('🔄 Ensuring "See More" is expanded before extracting content...');
    const expanded = await expandSeeMore(post);
    
    if (expanded) {
        console.log('⏳ "See More" was expanded, waiting for content to stabilize...');
        await sleep(1000); // Wait for content to fully load after expansion
    }
    
    // Debug: Log all text content to understand the structure
    console.log('=== DEBUG: ALL TEXT CONTENT AFTER EXPANSION ===');
    const allText = post.innerText || post.textContent || '';
    console.log('Full post text length:', allText.length);
    console.log('Full post text preview:', allText.substring(0, 300));
    
    // Log all text lines for debugging
    const allLines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    console.log('Total text lines:', allLines.length);
    console.log('First 10 lines:', allLines.slice(0, 10));
    
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
        console.log('✅ Found content via post_message selector');
        return contentElement.innerText.trim();
    }
    
    contentElement = post.querySelector('.userContent');
    if (contentElement && contentElement.innerText.trim()) {
        console.log('✅ Found content via userContent selector');
        return contentElement.innerText.trim();
    }
    
    // Look for text content in common Facebook post content containers
    const contentSelectors = [
        '[data-ad-preview="message"]',
        '[data-testid="story-content"]',
        '[role="article"] > div > div > div',
        '.story_body_container',
        '.text_exposed_root'
    ];
    
    for (const selector of contentSelectors) {
        try {
            contentElement = post.querySelector(selector);
            if (contentElement && contentElement.innerText.trim()) {
                console.log(`✅ Found content via ${selector} selector`);
                return contentElement.innerText.trim();
            }
        } catch (e) {
            // Ignore selector errors
        }
    }
    
    // Look for actual post content by analyzing structure
    console.log('=== ANALYZING POST STRUCTURE FOR CONTENT ===');
    
    // Filter out UI lines and find content
    const filteredLines = allLines.filter(line => {
        const trimmed = line.trim();
        
        // Skip UI elements and common patterns
        if (trimmed === 'Approve' || trimmed === 'Decline' || 
            trimmed === 'Send' || trimmed === 'Facebook' ||
            trimmed === 'Share' || trimmed === 'Like' ||
            trimmed === 'See more' ||
            trimmed.includes('Pending posts') ||
            trimmed.match(/^\d+\s*[·•]\s*\d*$/) || // Skip "7 · " patterns
            trimmed.match(/^\d+[mhd]$/i) || // Skip time patterns like "1m"
            trimmed.match(/^[·•]\s*\d+$/) || // Skip "· 7" patterns
            trimmed.match(/^[A-Za-z0-9]{1,3}$/) || // Skip short codes
            /^[A-Za-z0-9\s]{1,3}$/.test(trimmed) || // Skip very short text
            trimmed.length <= 2) {
            return false;
        }
        
        // Skip Wikipedia-style content patterns
        if (trimmed.includes('מצב שימור') ||
            trimmed.includes('מיון מדעי') ||
            trimmed.includes('ממלכה:') ||
            trimmed.includes('מחלקה:') ||
            trimmed.includes('משפחה:') ||
            trimmed.includes('סדרה:') ||
            trimmed.includes('Canis lupus') ||
            trimmed.includes('שם מדעי') ||
            (trimmed.includes('מפנה לכאן') && trimmed.includes('פירושונים')) ||
            trimmed.includes('בעלי חיים') ||
            trimmed.includes('יונקים') ||
            trimmed.includes('טורפים')) {
            return false;
        }
        
        // Skip if line is just single words repeated (like "Facebook" multiple times)
        const words = trimmed.split(/\s+/);
        if (words.length > 5 && words.every(word => word === words[0])) {
            return false;
        }
        
        // Keep meaningful lines that aren't repeated UI elements
        return true;
    });
    
    console.log('Filtered content lines count:', filteredLines.length);
    console.log('Filtered content lines:', filteredLines.slice(0, 5)); // Show first 5
    
    // Look for the main post content (usually comes after author info)
    let authorLine = '';
    let contentLines = [];
    let foundRealContent = false;
    
    for (let i = 0; i < filteredLines.length; i++) {
        const line = filteredLines[i];
        
        // Skip very short lines and single characters
        if (line.length <= 3 || /^[A-Za-z0-9\s]{1,3}$/.test(line)) continue;
        
        // First substantial line that looks like a name might be author
        if (!authorLine && line.length > 3 && line.length < 100 && !line.includes('http')) {
            authorLine = line;
            console.log('Potential author line:', authorLine);
            continue;
        }
        
        // Check if this line looks like actual post content
        if (authorLine && line.length > 10) {
            // Skip if it's clearly not post content
            if (line.includes('מצב שימור') || 
                line.includes('מיון מדעי') ||
                line.includes('ממלכה:') ||
                line.includes('Canis lupus') ||
                line.includes('המונח') && line.includes('מפנה לכאן')) {
                console.log('Skipping non-post content line:', line.substring(0, 50));
                continue;
            }
            
            // This looks like real post content
            contentLines.push(line);
            foundRealContent = true;
            console.log('Adding content line:', line.substring(0, 100));
        }
    }
    
    // If we didn't find real content, this might be a problematic post
    if (!foundRealContent && filteredLines.length > 10) {
        console.log('⚠️ Suspicious content detected - possibly extracted wrong elements');
        console.log('First few filtered lines:', filteredLines.slice(0, 5));
        
        // Try to find content that starts with actual post markers
        const realContentLines = filteredLines.filter(line => {
            return line.length > 15 && 
                   !line.includes('מצב שימור') &&
                   !line.includes('מיון מדעי') &&
                   !line.includes('ממלכה:') &&
                   !line.includes('Canis lupus') &&
                   !(line.includes('המונח') && line.includes('מפנה לכאן')) &&
                   (line.includes('מתפנה') || 
                    line.includes('מחפש') || 
                    line.includes('דירה') ||
                    line.includes('מכירה') ||
                    line.includes('היי') ||
                    line.includes('שלום') ||
                    line.includes('****') ||
                    line.includes('מפרסם'));
        });
        
        if (realContentLines.length > 0) {
            contentLines = realContentLines;
            console.log('Found real content using content markers');
        }
    }
    
    // Join multiple content lines if they exist
    const contentLine = contentLines.length > 0 ? contentLines.join('\n') : '';
    
    // Return the content if found
    if (contentLine && contentLine.length > 3) {
        // Remove "See more" patterns from the end of content
        let finalContent = contentLine.replace(/\s*(?:See more|\.{3,}|…+)\s*$/gi, '');
        
        console.log('=== FOUND POST CONTENT ===');
        console.log('Content length:', finalContent.length);
        console.log('Content preview:', finalContent.substring(0, 200));
        return finalContent;
    }
    
    // Fallback: look for any meaningful text that's not UI
    for (let line of filteredLines) {
        if (line.length > 8 && 
            !line.includes('·') && 
            !line.match(/^\d+[mhd]$/i) &&
            !line.includes('See more')) {
            console.log('=== FALLBACK CONTENT ===');
            console.log('Content:', line);
            return line;
        }
    }
    
    console.log('❌ No post content found after structure analysis');
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
