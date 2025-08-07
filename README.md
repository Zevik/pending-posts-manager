# Pending Posts Scanner

A Chrome extension that monitors Facebook group pending posts for specific keywords and saves results to Google Sheets.

## 🎯 Purpose

This extension scans **pending posts** (posts waiting for admin approval) in Facebook groups, unlike the original extension that scans published posts. It's designed for group administrators and moderators who want to monitor content before it gets published.

## 🚀 Features

- **Pending Posts Monitoring**: Scans posts waiting for approval in Facebook groups
- **Keyword Detection**: Searches for specific keywords in pending post content
- **Google Sheets Integration**: Automatically saves found posts to Google Sheets
- **Google Forms Support**: Can also send data to Google Forms
- **Multi-Group Support**: Monitor multiple groups in sequence
- **Automatic Scheduling**: Set intervals between groups and rounds
- **Daily Break**: Configure break times to pause monitoring

## 📋 Requirements

- **Admin/Moderator Access**: You must be an admin or moderator of the Facebook groups you want to monitor
- **Google Account**: For Google Sheets/Forms integration
- **Chrome Browser**: This is a Chrome extension

## 🛠️ Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `pending-posts-scanner` folder
5. The extension icon will appear in your Chrome toolbar

## ⚙️ Configuration

1. Click the extension icon to open the options page
2. Configure the following settings:

### Basic Settings
- **Interval between posts**: Time delay between processing each post (seconds)
- **Interval between groups**: Time delay between switching groups (minutes)
- **Interval between rounds**: Time delay before starting a new round (minutes)
- **Pages to scroll back**: How many pages to scan (usually 1 for pending posts)

### Google Integration
- **Setting Google Sheet URL**: Link to your configuration spreadsheet
- **Google Sheet URL**: Where to save the found posts
- **Google Form ID**: Alternative option to send data to Google Forms

### Group Configuration
Add your groups with URLs ending in `/pending`:
- **Group Name**: Descriptive name for the group
- **Group URL**: Must end with `/pending` (e.g., `https://www.facebook.com/groups/123456789/pending`)
- **Keywords**: Comma-separated list of keywords to search for

### Advanced Features
- **Daily Break**: Set times when monitoring should pause
- **Rerun Interval**: How often to restart the entire monitoring cycle

## 📝 Usage

1. **Set up your groups**: Enter group URLs ending with `/pending`
2. **Configure keywords**: Add keywords separated by commas
3. **Set up Google Sheets**: Create a spreadsheet and add its URL
4. **Start monitoring**: Click the "Start" button
5. **Monitor progress**: The extension will show toast notifications as it works

## 🔍 URL Format

**Important**: Group URLs must end with `/pending` to access pending posts:

✅ **Correct**: `https://www.facebook.com/groups/123456789/pending`
❌ **Wrong**: `https://www.facebook.com/groups/123456789`

## 📊 Data Saved

For each matching post, the extension saves:
- **Post Date**: When the post was created
- **Keyword Found**: Which keyword matched
- **Content**: The post text content
- **URL**: Link to the post
- **Author**: Who wrote the post
- **Group Name**: Which group it's from
- **Status**: "pending" (to distinguish from published posts)

## 🔧 Troubleshooting

### No Posts Found
- Verify you're an admin/moderator of the group
- Check that the URL ends with `/pending`
- Make sure there are actually pending posts in the group

### Extension Not Working
- Check console for errors (F12 → Console tab)
- Verify permissions are granted
- Make sure you're logged into Facebook

### Google Sheets Not Working
- Check your Google Sheets URL is correct
- Verify you have edit permissions to the sheet
- Ensure the Google OAuth is properly configured

## 🆚 Differences from Original Extension

| Feature | Original Extension | Pending Posts Scanner |
|---------|-------------------|----------------------|
| **Target** | Published posts in group feed | Pending posts awaiting approval |
| **Access** | Any group member | Admin/Moderator only |
| **URL Format** | Regular group URL | Group URL + `/pending` |
| **Pagination** | Multiple pages | Usually single page |
| **Post Status** | Published | Pending approval |

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

This project is licensed under the MIT License.
