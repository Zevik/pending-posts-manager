# Example Configuration for Pending Posts Scanner

## Setting up Your Groups

### Step 1: Get the Pending Posts URL
1. Go to your Facebook group as an admin/moderator
2. Navigate to **Admin Tools** → **Pending Posts** (or **Member Requests** → **Posts**)
3. Copy the URL - it should look like: `https://www.facebook.com/groups/123456789/pending`

### Step 2: Configure in Extension
Add groups with the following format:

#### Group 1
- **Group Name**: `My Community Group`
- **Group URL**: `https://www.facebook.com/groups/123456789/pending`
- **Keywords**: `urgent, help needed, recommendation`

#### Group 2
- **Group Name**: `Local Business Network`
- **Group URL**: `https://www.facebook.com/groups/987654321/pending`
- **Keywords**: `"new business", partnership, collaboration`

## Keyword Examples

### Simple Keywords
```
pizza, restaurant, delivery
```

### Exact Phrases (use quotes)
```
"pizza delivery", "new restaurant", "food recommendation"
```

### Multiple Words (must contain ALL words)
```
pizza+delivery, new+restaurant+recommendation
```

### Mixed Examples
```
pizza, "pizza delivery", food+recommendation, urgent
```

## Google Sheets Setup

### Step 1: Create a Google Sheet
1. Go to Google Sheets and create a new spreadsheet
2. Add headers in the first row:
   - A1: Date
   - B1: Group Name
   - C1: Author
   - D1: Keyword Found
   - E1: URL
   - F1: Content
   - G1: Status

### Step 2: Share the Sheet
1. Click "Share" in the top right
2. Change access to "Anyone with the link can edit"
3. Copy the share URL

### Step 3: Add to Extension
Paste the Google Sheets URL in the extension settings.

## Timing Configuration

### Recommended Settings for Pending Posts
- **Interval between posts**: 2-3 seconds
- **Interval between groups**: 1-2 minutes
- **Interval between rounds**: 30-60 minutes
- **Pages to scroll back**: 1 (pending posts usually on one page)

### Daily Break (Optional)
- **From**: 23:00 (11 PM)
- **To**: 07:00 (7 AM)

This will pause monitoring during night hours.

## Testing Your Setup

1. Start with one group and a few simple keywords
2. Check that posts appear in your Google Sheet
3. Verify the data is correct
4. Add more groups and keywords as needed

## Common Issues and Solutions

### "No pending posts found"
- Verify you're an admin/moderator
- Check the URL ends with `/pending`
- Make sure there are actually pending posts

### "Permission denied"
- Check your Google Sheets sharing settings
- Ensure the sheet URL is correct
- Try refreshing the page and restarting

### Posts not being detected
- Check your keywords are spelled correctly
- Try simpler keywords first
- Check the console for errors (F12)

## Pro Tips

1. **Test Keywords**: Start with broad keywords to see what gets detected
2. **Monitor Regularly**: Pending posts don't stay pending forever
3. **Use Exact Phrases**: For specific terms, use quotes: `"exact phrase"`
4. **Check Sheet Regularly**: Make sure data is being saved correctly
5. **Admin Access**: Only works if you're admin/moderator of the group
