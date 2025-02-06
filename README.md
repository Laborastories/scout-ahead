# Scout Ahead

A real-time League of Legends draft tool with fearless mode support.

## Features

- Real-time draft simulation for competitive League of Legends
- Support for Best of 1, Best of 3, and Best of 5 series
- Fearless draft mode - track picked champions across games
- Side selection tracking and management
- Unique URLs for team captains and spectators
- No account required - just create a lobby and share links

## Getting Started

Start the development server

```bash
wasp db start
wasp db migrate-dev
wasp start
```

Visit [scoutahead.pro](https://scoutahead.pro) to try it out.

## How It Works

### For Teams

1. Create a new draft series
2. Choose series type (Bo1/Bo3/Bo5)
3. Get unique URLs for:
   - Blue side captain
   - Red side captain
   - Spectators
4. Share links with your team

### For Captains

- Real-time champion grid with role filtering
- Pick/ban phase indicators
- Timer display
- Ready/confirm system
- Validation for legal picks/bans

### For Spectators

- Live updates of all picks and bans
- Full champion grid view
- Phase progression display
- Series history tracking

## Technical Stack

- Built with [Wasp](https://wasp-lang.dev)
- Real-time updates via WebSocket
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Animations powered by [Motion](https://motion.dev)

## Contributing

We welcome contributions! Whether it's:

- 🐛 Bug fixes
- ✨ New features
- 📝 Documentation improvements
- 💡 Suggestions

Feel free to open an issue or submit a pull request on our
[GitHub repository](https://github.com/Laborastories/wardstone-pick-ban).

## License

MIT License - feel free to use this in your own projects!

![Format & Lint pipeline status](https://github.com/Laborastories/wardstone-pick-ban/actions/workflows/format.yml/badge.svg)

## Champion Image Storage

The app can store champion images (icons and splash art) in an S3 bucket for better performance and reliability. To set this up:

1. Create an S3 bucket in your AWS account
2. Set up the following environment variables:
   ```
   AWS_REGION=your-region # e.g. us-east-1
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   AWS_BUCKET_NAME=your-bucket-name
   AWS_BUCKET_URL=https://your-bucket-name.s3.amazonaws.com # or your CloudFront URL
   ```

3. The app will automatically:
   - Download champion images from DDragon
   - Convert them to WebP format for better performance
   - Upload them to your S3 bucket
   - Use the S3 URLs in the UI

If S3 is not configured, the app will fall back to using DDragon and Community Dragon URLs directly.
