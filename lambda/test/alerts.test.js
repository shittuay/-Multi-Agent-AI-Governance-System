/**
 * Tests: Alert System - Policy Violation Notifications
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Set environment variable BEFORE loading the module
process.env.SNS_ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:AlertTopic';

// Mock AWS SDK before requiring the alerts module
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => ({
    send: mockSend,
  })),
  PublishCommand: jest.fn((params) => params),
}));

const { sendViolationAlert, sendAlert } = require('../middleware/alerts.js');

describe('Alert System', () => {
  const originalEnv = process.env.SNS_ALERT_TOPIC_ARN;

  beforeEach(() => {
    mockSend.mockClear();
    mockSend.mockResolvedValue({});
    // Restore environment variable for tests
    process.env.SNS_ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:AlertTopic';
  });

  afterEach(() => {
    process.env.SNS_ALERT_TOPIC_ARN = originalEnv;
  });

  // ─── sendViolationAlert ─────────────────────────────────────────────────────

  describe('sendViolationAlert', () => {
    const mockViolation = {
      policyId: 'no-self-approval',
      policyName: 'No Self-Approval of Policies',
      severity: 'high',
      message: 'User cannot approve their own policy',
    };

    const mockContext = {
      requester: {
        userId: 'user-001',
        role: 'admin',
        email: 'admin@example.com',
      },
      action: 'policy:approve',
      policy: {
        id: 'policy-123',
        name: 'Test Policy',
      },
    };

    it('sends SNS alert with correct parameters', async () => {
      mockSend.mockResolvedValueOnce({});

      await sendViolationAlert(mockViolation, mockContext);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];

      expect(call.TopicArn).toBe('arn:aws:sns:us-east-1:123456789012:AlertTopic');
      expect(call.Subject).toContain('[HIGH]');
      expect(call.Subject).toContain('No Self-Approval of Policies');
      expect(call.Subject).toContain('🟠'); // High severity emoji
      expect(call.Message).toContain('GOVERNANCE POLICY VIOLATION');
      expect(call.Message).toContain('no-self-approval');
      expect(call.Message).toContain('user-001');
      expect(call.Message).toContain('admin@example.com');
    });

    it('includes severity in message attributes', async () => {
      mockSend.mockResolvedValueOnce({});

      await sendViolationAlert(mockViolation, mockContext);

      const call = mockSend.mock.calls[0][0];
      expect(call.MessageAttributes.severity).toBeDefined();
      expect(call.MessageAttributes.severity.DataType).toBe('String');
      expect(call.MessageAttributes.severity.StringValue).toBe('high');
    });

    it('includes policyId in message attributes', async () => {
      mockSend.mockResolvedValueOnce({});

      await sendViolationAlert(mockViolation, mockContext);

      const call = mockSend.mock.calls[0][0];
      expect(call.MessageAttributes.policyId).toBeDefined();
      expect(call.MessageAttributes.policyId.StringValue).toBe('no-self-approval');
    });

    it('includes userId in message attributes', async () => {
      mockSend.mockResolvedValueOnce({});

      await sendViolationAlert(mockViolation, mockContext);

      const call = mockSend.mock.calls[0][0];
      expect(call.MessageAttributes.userId).toBeDefined();
      expect(call.MessageAttributes.userId.StringValue).toBe('user-001');
    });

    it('handles missing requester gracefully', async () => {
      mockSend.mockResolvedValueOnce({});

      const contextNoRequester = { action: 'policy:approve' };
      await sendViolationAlert(mockViolation, contextNoRequester);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.MessageAttributes.userId.StringValue).toBe('unknown');
      expect(call.Message).toContain('User ID:  unknown');
    });

    it('skips alert when SNS_ALERT_TOPIC_ARN not configured', async () => {
      delete process.env.SNS_ALERT_TOPIC_ARN;

      await sendViolationAlert(mockViolation, mockContext);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('does not throw when SNS send fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('SNS unavailable'));

      await expect(
        sendViolationAlert(mockViolation, mockContext)
      ).resolves.not.toThrow();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('logs error when SNS send fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValueOnce(new Error('SNS unavailable'));

      await sendViolationAlert(mockViolation, mockContext);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Alerts] Failed to send SNS alert:'),
        'SNS unavailable'
      );

      consoleErrorSpy.mockRestore();
    });

    describe('severity-specific formatting', () => {
      it('uses correct emoji for critical severity', async () => {
        mockSend.mockResolvedValueOnce({});
        const criticalViolation = { ...mockViolation, severity: 'critical' };

        await sendViolationAlert(criticalViolation, mockContext);

        const call = mockSend.mock.calls[0][0];
        expect(call.Subject).toContain('🔴'); // Critical emoji
        expect(call.Subject).toContain('[CRITICAL]');
      });

      it('uses correct emoji for high severity', async () => {
        mockSend.mockResolvedValueOnce({});
        const highViolation = { ...mockViolation, severity: 'high' };

        await sendViolationAlert(highViolation, mockContext);

        const call = mockSend.mock.calls[0][0];
        expect(call.Subject).toContain('🟠');
        expect(call.Subject).toContain('[HIGH]');
      });

      it('uses correct emoji for medium severity', async () => {
        mockSend.mockResolvedValueOnce({});
        const mediumViolation = { ...mockViolation, severity: 'medium' };

        await sendViolationAlert(mediumViolation, mockContext);

        const call = mockSend.mock.calls[0][0];
        expect(call.Subject).toContain('🟡');
        expect(call.Subject).toContain('[MEDIUM]');
      });

      it('uses correct emoji for low severity', async () => {
        mockSend.mockResolvedValueOnce({});
        const lowViolation = { ...mockViolation, severity: 'low' };

        await sendViolationAlert(lowViolation, mockContext);

        const call = mockSend.mock.calls[0][0];
        expect(call.Subject).toContain('🟢');
        expect(call.Subject).toContain('[LOW]');
      });

      it('uses fallback emoji for unknown severity', async () => {
        mockSend.mockResolvedValueOnce({});
        const unknownViolation = { ...mockViolation, severity: 'unknown' };

        await sendViolationAlert(unknownViolation, mockContext);

        const call = mockSend.mock.calls[0][0];
        expect(call.Subject).toContain('⚠️');
      });
    });
  });

  // ─── sendAlert ──────────────────────────────────────────────────────────────

  describe('sendAlert', () => {
    beforeEach(() => {
      process.env.SNS_ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:AlertTopic';
    });

    it('sends generic alert with correct parameters', async () => {
      mockSend.mockResolvedValueOnce({});

      await sendAlert('high', 'System Health Alert', 'Database connection pool exhausted');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];

      expect(call.TopicArn).toBe('arn:aws:sns:us-east-1:123456789012:AlertTopic');
      expect(call.Subject).toContain('[HIGH]');
      expect(call.Subject).toContain('System Health Alert');
      expect(call.Message).toBe('Database connection pool exhausted');
    });

    it('includes severity in message attributes', async () => {
      mockSend.mockResolvedValueOnce({});

      await sendAlert('critical', 'Critical Alert', 'System failure');

      const call = mockSend.mock.calls[0][0];
      expect(call.MessageAttributes.severity).toBeDefined();
      expect(call.MessageAttributes.severity.StringValue).toBe('critical');
    });

    it('adds emoji based on severity', async () => {
      mockSend.mockResolvedValueOnce({});

      await sendAlert('critical', 'Test Alert', 'Test message');

      const call = mockSend.mock.calls[0][0];
      expect(call.Subject).toContain('🔴');
    });

    it('skips alert when SNS_ALERT_TOPIC_ARN not configured', async () => {
      delete process.env.SNS_ALERT_TOPIC_ARN;

      await sendAlert('high', 'Test', 'Message');

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('does not throw when SNS send fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        sendAlert('medium', 'Test Alert', 'Test message')
      ).resolves.not.toThrow();
    });

    it('logs success message', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSend.mockResolvedValueOnce({});

      await sendAlert('medium', 'Test Alert', 'Test message');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Alerts] Sent medium alert: Test Alert')
      );

      consoleLogSpy.mockRestore();
    });
  });

  // ─── Message Formatting ─────────────────────────────────────────────────────

  describe('Alert message formatting', () => {
    beforeEach(() => {
      process.env.SNS_ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:AlertTopic';
      process.env.FRONTEND_URL = 'https://governance.example.com';
    });

    it('includes policy violation details in message body', async () => {
      mockSend.mockResolvedValueOnce({});

      const violation = {
        policyId: 'no-self-approval',
        policyName: 'No Self-Approval',
        severity: 'high',
        message: 'Self-approval blocked',
      };

      const context = {
        requester: { userId: 'user-001', role: 'admin', email: 'admin@example.com' },
        action: 'policy:approve',
        policy: { id: 'pol-123', name: 'Test Policy' },
      };

      await sendViolationAlert(violation, context);

      const call = mockSend.mock.calls[0][0];
      const message = call.Message;

      expect(message).toContain('🚨 GOVERNANCE POLICY VIOLATION');
      expect(message).toContain('Policy:     No Self-Approval (no-self-approval)');
      expect(message).toContain('Severity:   HIGH');
      expect(message).toContain('User ID:  user-001');
      expect(message).toContain('Role:     admin');
      expect(message).toContain('Email:    admin@example.com');
      expect(message).toContain('Action:   policy:approve');
      expect(message).toContain('View audit logs: https://governance.example.com/audit');
    });

    it('includes recommended actions in message', async () => {
      mockSend.mockResolvedValueOnce({});

      const violation = {
        policyId: 'test',
        policyName: 'Test',
        severity: 'high',
        message: 'Test violation',
      };

      await sendViolationAlert(violation, {});

      const call = mockSend.mock.calls[0][0];
      const message = call.Message;

      expect(message).toContain('Recommended Actions:');
      expect(message).toContain('1. Review the audit logs');
      expect(message).toContain('2. Verify this was not a legitimate action');
      expect(message).toContain('3. Contact the user if suspicious');
      expect(message).toContain('4. Update policies if this rule is too restrictive');
    });

    it('includes context details when provided', async () => {
      mockSend.mockResolvedValueOnce({});

      const violation = {
        policyId: 'test',
        policyName: 'Test',
        severity: 'medium',
        message: 'Test',
      };

      const context = {
        requester: { userId: 'user-001' },
        action: 'policy:approve',
        policy: { id: 'pol-123', name: 'Test Policy' },
        resourceId: 'res-456',
      };

      await sendViolationAlert(violation, context);

      const call = mockSend.mock.calls[0][0];
      const message = call.Message;

      expect(message).toContain('Policy:   Test Policy (pol-123)');
      expect(message).toContain('Resource: res-456');
    });

    it('handles missing context fields gracefully', async () => {
      mockSend.mockResolvedValueOnce({});

      const violation = {
        policyId: 'test',
        policyName: 'Test',
        severity: 'low',
        message: 'Test',
      };

      await sendViolationAlert(violation, {});

      const call = mockSend.mock.calls[0][0];
      const message = call.Message;

      expect(message).toContain('User ID:  unknown');
      expect(message).toContain('Role:     unknown');
      expect(message).toContain('Email:    unknown');
      expect(message).toContain('Action:   unknown');
    });

    it('uses default FRONTEND_URL when not set', async () => {
      delete process.env.FRONTEND_URL;
      mockSend.mockResolvedValueOnce({});

      const violation = {
        policyId: 'test',
        policyName: 'Test',
        severity: 'medium',
        message: 'Test',
      };

      await sendViolationAlert(violation, {});

      const call = mockSend.mock.calls[0][0];
      expect(call.Message).toContain('https://governance.example.com/audit');
    });
  });
});
