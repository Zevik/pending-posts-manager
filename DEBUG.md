# Debugging Guide for Pending Posts Scanner

## How to Debug the Extension

### 1. Check Console Logs

1. Open Chrome DevTools (F12)
2. Go to the **Console** tab
3. Start the extension
4. Look for these log messages:

#### Background Script Logs:
- `=== ASKING CONTENT TO START SCRAPING ===`
- `tabId` and `currGroupIndex`
- `Sending message to content script after 10s delay...`

#### Content Script Logs:
- `=== CONTENT SCRIPT RECEIVED MESSAGE ===`
- `=== STARTING PENDING POSTS SCAN ===`
- `=== TOTAL PENDING POSTS FOUND: X ===`

### 2. Common Issues and Solutions

#### Issue: "isBlock: true" in logs
**Symptoms:** Extension skips groups immediately
**Cause:** `isBlockPage()` function returning true
**Solution:** 
- Check if you're actually on a `/pending` URL
- Verify you have admin/moderator access
- Look for error messages on the page

#### Issue: No posts found
**Symptoms:** "No pending posts found"
**Debug steps:**
1. Check URL format: must end with `/pending`
2. Verify admin access to the group
3. Check if there are actually pending posts
4. Look at DOM structure in Elements tab

#### Issue: Content script not receiving messages
**Symptoms:** No content script logs
**Debug steps:**
1. Check if extension loaded properly
2. Verify URL matches in manifest.json
3. Reload the extension
4. Check for JavaScript errors

### 3. Manual Testing Steps

1. **Test URL Format:**
   ```
   ✅ https://www.facebook.com/groups/123456789/pending
   ❌ https://www.facebook.com/groups/123456789
   ```

2. **Test Admin Access:**
   - Navigate manually to the pending posts page
   - You should see pending posts if you're an admin
   - If you see "Permission denied" - you're not an admin

3. **Test Extension Loading:**
   - Go to `chrome://extensions/`
   - Check if "Pending Posts Scanner" is enabled
   - Look for any error messages

### 4. Debug Console Commands

Run these in the console on a pending posts page:

```javascript
// Check if on pending page
console.log('URL includes pending:', window.location.href.includes('/pending'));

// Check for posts with different selectors
console.log('PendingPostsPagelet:', document.querySelectorAll('[data-pagelet="PendingPostsPagelet"] [role="article"]').length);
console.log('pending-posts-feed:', document.querySelectorAll('[data-testid="pending-posts-feed"] [role="article"]').length);
console.log('All articles:', document.querySelectorAll('[role="article"]').length);

// Check page structure
console.log('Page title:', document.title);
console.log('Main containers:', document.querySelectorAll('[role="main"]').length);
```

### 5. Extension Reload Steps

If the extension isn't working:

1. Go to `chrome://extensions/`
2. Find "Pending Posts Scanner"
3. Click the reload button (🔄)
4. Navigate to a pending posts page
5. Try again

### 6. Check Background Script

1. Go to `chrome://extensions/`
2. Click "Details" on the extension
3. Click "Inspect views: background page"
4. Check console for background script logs

### 7. Facebook Interface Changes

If Facebook changed their interface:

1. Right-click on a pending post
2. Select "Inspect Element"
3. Look for:
   - `data-testid` attributes
   - `data-pagelet` attributes
   - `role="article"` elements
4. Update selectors in content.js if needed
