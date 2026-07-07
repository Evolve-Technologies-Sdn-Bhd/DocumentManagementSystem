const nodemailer = require('nodemailer');
const configService = require('./configService');

/**
 * Email Service for sending emails using SMTP
 */
class EmailService {
  constructor() {
    this.transporter = null;
  }

  formatDateTime(value) {
    if (!value) return 'N/A'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  renderDetailRows(rows = []) {
    return rows
      .filter((row) => row && row.value !== undefined && row.value !== null && row.value !== '')
      .map((row) => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; width: 38%; color: #4b5563; font-weight: 600;">${row.label}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827;">${row.value}</td>
        </tr>
      `)
      .join('')
  }

  /**
   * Get notification settings from database
   */
  async getSettings() {
    try {
      return await configService.getNotificationSettings();
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      // Return default settings if database fails
      return {
        smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtpPort: process.env.SMTP_PORT || 587,
        smtpUsername: process.env.SMTP_USERNAME || '',
        smtpPassword: process.env.SMTP_PASSWORD || '',
        fromName: process.env.FROM_NAME || 'DMS System',
        fromEmail: process.env.FROM_EMAIL || 'noreply@company.com',
        notifications: {},
        reviewReminder: 3,
        approvalReminder: 2,
        dailyDigest: false,
        digestTime: '09:00'
      };
    }
  }

  /**
   * Create transporter with current SMTP settings
   */
  async createTransporter() {
    const settings = await this.getSettings();

    // Create transporter with SMTP settings
    this.transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort),
      secure: parseInt(settings.smtpPort) === 465, // true for 465, false for other ports
      auth: {
        user: settings.smtpUsername,
        pass: settings.smtpPassword
      },
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates
      }
    });

    return this.transporter;
  }

  /**
   * Test SMTP connection
   */
  async testConnection() {
    try {
      const transporter = await this.createTransporter();
      await transporter.verify();
      return { success: true, message: 'SMTP connection successful' };
    } catch (error) {
      console.error('SMTP connection test failed:', error);
      return { 
        success: false, 
        message: error.message || 'SMTP connection failed',
        error: error.toString()
      };
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(toEmail) {
    try {
      const settings = await this.getSettings();
      const transporter = await this.createTransporter();

      const mailOptions = {
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: toEmail,
        subject: 'DMS - Test Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">Test Email from DMS</h2>
            <p>This is a test email to verify your SMTP configuration.</p>
            <p>If you received this email, your email settings are working correctly!</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
              Sent from Document Management System<br>
              ${new Date().toLocaleString()}
            </p>
          </div>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      return { 
        success: true, 
        message: 'Test email sent successfully',
        messageId: info.messageId
      };
    } catch (error) {
      console.error('Failed to send test email:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to send test email',
        error: error.toString()
      };
    }
  }

  /**
   * Send email
   */
  async sendEmail({ to, subject, html, text }) {
    try {
      const settings = await this.getSettings();
      const transporter = await this.createTransporter();

      const mailOptions = {
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to,
        subject,
        html,
        text: text || '' // Plain text version (optional)
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return { 
        success: true, 
        messageId: info.messageId 
      };
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Send notification email for document events
   */
  async sendNotificationEmail(to, type, data) {
    const normalizeType = (t) => {
      const raw = String(t || '').trim()
      if (!raw) return raw
      const map = {
        documentCreated: 'DOCUMENT_CREATED',
        documentSubmitted: 'DOCUMENT_SUBMITTED',
        reviewAssigned: 'REVIEW_ASSIGNED',
        reviewCompleted: 'REVIEW_COMPLETED',
        approvalRequest: 'APPROVAL_REQUEST',
        documentApproved: 'DOCUMENT_APPROVED',
        documentRejected: 'DOCUMENT_REJECTED',
        documentPublished: 'DOCUMENT_PUBLISHED',
        documentSuperseded: 'DOCUMENT_SUPERSEDED',
        documentObsoleted: 'DOCUMENT_OBSOLETED',
        documentReturned: 'DOCUMENT_RETURNED',
        acknowledgeRequired: 'ACKNOWLEDGE_REQUIRED',
        acknowledgeCompleted: 'ACKNOWLEDGE_COMPLETED',
        documentExpiring: 'DOCUMENT_EXPIRING',
        documentExpired: 'DOCUMENT_EXPIRED',
        renewalInProgress: 'RENEWAL_IN_PROGRESS',
        renewalCompleted: 'RENEWAL_COMPLETED',
        systemAlert: 'SYSTEM_ALERT'
      }
      return map[raw] || raw
    }

    const templates = {
      DOCUMENT_CREATED: {
        subject: '📄 New Document Created',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">New Document Created</h2>
            <p>A new document has been created in the system:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              <p><strong>Type:</strong> ${d.documentType}</p>
              <p><strong>Created By:</strong> ${d.createdBy}</p>
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 5px;">View Document</a>
          </div>
        `
      },
      ACKNOWLEDGE_REQUIRED: {
        subject: '📌 Document Acknowledgment Required',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">Acknowledgment Required</h2>
            <p>A document request requires your acknowledgment:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              ${d.fileCode ? `<p><strong>File Code:</strong> ${d.fileCode}</p>` : ''}
              <p><strong>Requested By:</strong> ${d.requestedBy || d.createdBy || d.submittedBy || 'Unknown'}</p>
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 5px;">Open Request</a>
          </div>
        `
      },
      ACKNOWLEDGE_COMPLETED: {
        subject: '✅ Document Request Acknowledged',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10B981;">Request Acknowledged</h2>
            <p>Your document request has been acknowledged:</p>
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              ${d.fileCode ? `<p><strong>File Code:</strong> ${d.fileCode}</p>` : ''}
              ${d.acknowledgedBy ? `<p><strong>Acknowledged By:</strong> ${d.acknowledgedBy}</p>` : ''}
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #10B981; color: white; text-decoration: none; border-radius: 5px;">View</a>
          </div>
        `
      },
      DOCUMENT_SUBMITTED: {
        subject: '✅ Document Submitted for Review',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">Document Submitted for Review</h2>
            <p>A document has been submitted and requires your review:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              <p><strong>Submitted By:</strong> ${d.submittedBy}</p>
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 5px;">Review Document</a>
          </div>
        `
      },
      REVIEW_ASSIGNED: {
        subject: '👁️ Document Review Assigned',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">Review Assigned to You</h2>
            <p>You have been assigned to review a document:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              <p><strong>Assigned By:</strong> ${d.assignedBy}</p>
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 5px;">Start Review</a>
          </div>
        `
      },
      APPROVAL_REQUEST: {
        subject: '✍️ Document Approval Required',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">Approval Required</h2>
            <p>A document requires your approval:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              <p><strong>Reviewed By:</strong> ${d.reviewedBy}</p>
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #10B981; color: white; text-decoration: none; border-radius: 5px;">Review & Approve</a>
          </div>
        `
      },
      DOCUMENT_APPROVED: {
        subject: '✅ Document Approved',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10B981;">Document Approved</h2>
            <p>Your document has been approved:</p>
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              <p><strong>Approved By:</strong> ${d.approvedBy}</p>
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #10B981; color: white; text-decoration: none; border-radius: 5px;">View Document</a>
          </div>
        `
      },
      DOCUMENT_REJECTED: {
        subject: '❌ Document Returned for Revision',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #EF4444;">Document Returned</h2>
            <p>Your document has been returned for revision:</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              <p><strong>Returned By:</strong> ${d.rejectedBy}</p>
              ${d.comments ? `<p><strong>Comments:</strong> ${d.comments}</p>` : ''}
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #EF4444; color: white; text-decoration: none; border-radius: 5px;">View & Revise</a>
          </div>
        `
      },
      DOCUMENT_PUBLISHED: {
        subject: '🎉 Document Published',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">Document Published</h2>
            <p>A document has been published:</p>
            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              <p><strong>Published By:</strong> ${d.publishedBy}</p>
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 5px;">View Published Document</a>
          </div>
        `
      },
      DOCUMENT_SUPERSEDED: {
        subject: '🔁 Document Superseded',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">Document Superseded</h2>
            <p>A document has been superseded:</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              ${d.supersededBy ? `<p><strong>Superseded By:</strong> ${d.supersededBy}</p>` : ''}
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 5px;">View</a>
          </div>
        `
      },
      DOCUMENT_OBSOLETED: {
        subject: '🛑 Document Marked Obsolete',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #EF4444;">Document Marked Obsolete</h2>
            <p>A document has been marked as obsolete:</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              ${d.reason ? `<p><strong>Reason:</strong> ${d.reason}</p>` : ''}
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #EF4444; color: white; text-decoration: none; border-radius: 5px;">View</a>
          </div>
        `
      },
      REVIEW_COMPLETED: {
        subject: '✅ Document Reviewed',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">Document Reviewed</h2>
            <p>Your document has been reviewed and forwarded:</p>
            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              <p><strong>Reviewed By:</strong> ${d.reviewedBy || 'Unknown'}</p>
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 5px;">View Document</a>
          </div>
        `
      },
      DOCUMENT_RETURNED: {
        subject: '↩️ Document Returned for Amendments',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #EF4444;">Document Returned</h2>
            <p>Your document has been returned for amendments:</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Title:</strong> ${d.title}</p>
              <p><strong>File Code:</strong> ${d.fileCode}</p>
              ${d.comments ? `<p><strong>Comments:</strong> ${d.comments}</p>` : ''}
            </div>
            <a href="${d.link}" style="display: inline-block; padding: 10px 20px; background: #EF4444; color: white; text-decoration: none; border-radius: 5px;">View Document</a>
          </div>
        `
      },
      DOCUMENT_EXPIRED: {
        subject: (d) => d.subject || 'Document Expired',
        html: (d) => `
          <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
            <h2 style="color: #DC2626; margin-bottom: 8px;">Document Expired</h2>
            <p style="margin-top: 0; color: #4b5563;">This document has expired and requires attention.</p>

            <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 10px; margin: 20px 0;">
              <p style="margin: 0 0 6px 0;"><strong>${d.title || d.fileName || 'Document'}</strong></p>
              ${d.fileCode ? `<p style="margin: 0; color: #6b7280;"><strong>File Code:</strong> ${d.fileCode}</p>` : ''}
              ${d.fileName ? `<p style="margin: 6px 0 0 0; color: #6b7280;"><strong>File Name:</strong> ${d.fileName}</p>` : ''}
            </div>

            <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin: 20px 0;">
              ${this.renderDetailRows([
                { label: 'Owner', value: d.ownerName || 'N/A' },
                { label: 'Notification Recipient', value: d.recipientName || d.recipientEmail || 'N/A' },
                { label: 'Recipients Notified', value: Array.isArray(d.notifiedRecipients) ? d.notifiedRecipients.join(', ') : '' },
                { label: 'Expired For', value: Number.isFinite(d.expiredDays) ? `${d.expiredDays} day(s)` : '' },
                { label: 'Expiry Date', value: this.formatDateTime(d.expiryDate) },
                { label: 'Last Upload', value: this.formatDateTime(d.lastUploadAt) }
              ])}
            </table>

            <a href="${d.link}" style="display: inline-block; padding: 11px 22px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">View Document</a>

            <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
              Open the document link to review the expired file details and take the next action.
            </p>
          </div>
        `
      }
    };

    const templateKey = normalizeType(type)
    const template = templates[templateKey];
    if (!template) {
      const d = data || {}
      const subject = d.subject || d.title || `DMS Notification (${String(type || '').trim() || 'event'})`
      const link = d.link || ''
      const message = d.message || ''
      await this.sendEmail({
        to,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f6fcf;">${d.title || 'Notification'}</h2>
            ${message ? `<p>${message}</p>` : ''}
            ${link ? `<a href="${link}" style="display: inline-block; padding: 10px 20px; background: #0f6fcf; color: white; text-decoration: none; border-radius: 5px;">Open</a>` : ''}
          </div>
        `
      });
      return;
    }

    try {
      await this.sendEmail({
        to,
        subject: typeof template.subject === 'function' ? template.subject(data) : (data?.subject || template.subject),
        html: template.html(data)
      });
    } catch (error) {
      console.error(`Failed to send ${String(type)} email:`, error);
      throw error;
    }
  }
}

module.exports = new EmailService();
