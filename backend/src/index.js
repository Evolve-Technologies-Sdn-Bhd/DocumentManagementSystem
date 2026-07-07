const app = require('./app');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const retentionService = require('./services/retentionService');
const expiryReminderService = require('./services/expiryReminderService');
const reviewApprovalReminderService = require('./services/reviewApprovalReminderService');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const port = process.env.PORT || 4000;

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, '../uploads');
const uploadSubDirs = ['temp', 'templates', 'documents', 'profiles', 'landing'];

// Ensure backups directory exists
const backupsDir = path.join(__dirname, '../backups');
try {
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
    console.log('Created backups directory');
  }
} catch (error) {
  console.error('Error creating backups directory:', error);
}

try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory');
  }
  
  uploadSubDirs.forEach(subDir => {
    const dirPath = path.join(uploadsDir, subDir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created ${subDir} directory`);
    }
  });
  
  console.log('Upload directories verified');
} catch (error) {
  console.error('Error creating upload directories:', error);
}

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
  
  // Initialize retention policy cleanup scheduler
  retentionService.scheduleRetentionCleanup();
  console.log('Retention policy scheduler initialized');

  expiryReminderService.scheduleDailyProcessing();
  console.log('Expiry tracking scheduler initialized');

  reviewApprovalReminderService.scheduleProcessing();
  console.log('Review and approval reminder scheduler initialized');
});
