# 📋 Pending Posts Manager

A Chrome extension that monitors Facebook group **pending posts** (posts waiting for admin approval) for specific keywords and automatically saves results to Google Sheets.

## 🎯 What makes this different?

This extension scans **pending posts** - posts that are waiting for admin/moderator approval - unlike other tools that scan published posts. This is particularly useful for group administrators who want to monitor content before it goes live.

## ✨ Features

- 🔍 **Pending Posts Monitoring** - Scans posts awaiting approval in Facebook groups
- 🎯 **Smart Keyword Detection** - Searches for specific keywords with AND/OR logic
- 📊 **Google Sheets Integration** - Automatically saves found posts to spreadsheets
- 📝 **Google Forms Support** - Alternative option to send data to forms
- 🔄 **Multi-Group Support** - Monitor multiple groups in sequence
- ⏰ **Automated Scheduling** - Set intervals between groups and rounds
- 🛑 **Daily Break Periods** - Configure break times to pause monitoring
- � **Admin Access Required** - Works only with groups you admin/moderate

## 🚀 Quick Start

### Prerequisites
- Chrome browser
- Admin/Moderator access to Facebook groups
- Google account (for Sheets integration)

### Installation
1. Download or clone this repository
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → Select the project folder
5. Extension icon appears in toolbar

### Configuration
1. Click extension icon → Opens options page
2. Add group URLs ending with `/pending`
3. Set keywords (comma-separated)
4. Configure Google Sheets URL
5. Click "Start"

## 📋 Usage Example

### Group Setup
```
Group Name: My Community Group
Group URL: https://www.facebook.com/groups/123456789/pending
Keywords: urgent, help needed, "new member"
```

### URL Format
✅ **Correct**: `https://www.facebook.com/groups/123456789/pending`  
❌ **Wrong**: `https://www.facebook.com/groups/123456789`

## 🔧 Advanced Features

### Keyword Syntax
- **Simple**: `pizza, restaurant` (OR logic)
- **Exact phrases**: `"pizza delivery"` (exact match)
- **AND logic**: `pizza+delivery` (both words required)
- **Mixed**: `pizza, "pizza delivery", food+recommendation`

### Timing Configuration
- **Post interval**: 2-3 seconds between posts
- **Group interval**: 1-2 minutes between groups  
- **Round interval**: 30-60 minutes between complete cycles
- **Daily breaks**: Pause during specified hours

## 📊 Data Output

Each matching post saves:
- 📅 Post date
- 🔍 Keyword found
- 📝 Post content
- � Post URL
- 👤 Author name
- 🏷️ Group name
- ⏳ Status: "pending"

## 🛠️ Technical Details

### Built With
- **Manifest V3** - Latest Chrome extension standard
- **jQuery** - DOM manipulation
- **Toastr** - User notifications
- **Google APIs** - Sheets integration

### Project Structure
```
pending-posts-manager/
├── manifest.json           # Extension configuration
├── js/
│   ├── content.js          # Facebook page interaction
│   ├── background.js       # Core processing logic
│   ├── options.js          # Settings interface
│   └── lib/               # External libraries
├── html/
│   └── options.html       # Settings page
├── css/
│   └── options.css        # Styling
├── icons/                 # Extension icons
└── docs/                  # Documentation files
```

## � Troubleshooting

### Common Issues

**"No posts found"**
- Verify you're admin/moderator of the group
- Check URL ends with `/pending`
- Ensure there are actually pending posts

**"Permission denied"**
- Not an admin/moderator of the group
- Check group privacy settings

**Extension not working**
- Reload extension in `chrome://extensions/`
- Check console for errors (F12)
- Verify you're logged into Facebook

### Debug Mode
Enable debug logging by:
1. Open Chrome DevTools (F12)
2. Check Console tab for detailed logs
3. Look for messages starting with `===`

## 📚 Documentation

- [📖 Setup Guide](SETUP-GUIDE.md) - Detailed configuration instructions
- [🚀 Installation Guide](INSTALL.md) - Quick installation steps
- [🐛 Debug Guide](DEBUG.md) - Troubleshooting and debugging
- [🇮🇱 Hebrew README](README-he.md) - תיעוד בעברית

## 🆚 Comparison with Regular Group Monitoring

| Feature | Regular Group Monitor | Pending Posts Manager |
|---------|----------------------|----------------------|
| **Target** | Published posts | Pending posts (awaiting approval) |
| **Access** | Any group member | Admin/Moderator only |
| **URL** | `/groups/ID` | `/groups/ID/pending` |
| **Use Case** | Monitor public discussions | Pre-moderate content |
| **Pagination** | Multiple pages | Usually single page |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## ⚠️ Important Notes

- **Admin Access Required**: You must be admin/moderator of groups you monitor
- **Rate Limiting**: Built-in delays prevent Facebook blocking
- **Privacy**: Extension only works with groups you already have access to
- **Data**: All data stays between you, Facebook, and your Google Sheets

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎉 Acknowledgments

- Built for Facebook group administrators and moderators
- Inspired by the need for better content pre-moderation tools
- Thanks to the open-source community for the libraries used

---

**Happy Moderating! 🎯**
