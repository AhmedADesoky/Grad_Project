/**
 * Unit tests for emailService.js
 * Tests the sendExamScoreEmail weakAreas deduplication logic
 * without actually sending emails (nodemailer is mocked).
 */

import { jest } from '@jest/globals';

// ── Mock nodemailer before importing emailService ─────────────────────────────
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
}));

// ── Set env vars before module load ──────────────────────────────────────────
process.env.GMAIL_USER = 'test@gmail.com';
process.env.GMAIL_APP_PASSWORD = 'testpassword';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { sendExamScoreEmail, sendOTPEmail, sendWelcomeEmail } = await import('../services/emailService.js');

// ─────────────────────────────────────────────────────────────────────────────

describe('sendExamScoreEmail', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  test('deduplicates weakAreas — exact duplicates removed', async () => {
    await sendExamScoreEmail('student@test.com', {
      userName: 'Alice',
      score: 72,
      level: 'B1',
      passed: true,
      weakAreas: ['Grammar', 'Grammar', 'Vocabulary'],
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    // HTML should contain Grammar once and Vocabulary once
    const grammarMatches = (call.html.match(/Grammar/g) || []).length;
    // Grammar appears at most once in the list (may appear in heading too)
    const weakListSection = call.html.split('Areas to improve:')[1] || '';
    expect(weakListSection).not.toMatch(/Grammar.*Grammar/s);
  });

  test('deduplicates weakAreas — case-insensitive duplicates removed', async () => {
    await sendExamScoreEmail('student@test.com', {
      userName: 'Bob',
      score: 60,
      level: 'A2',
      passed: false,
      weakAreas: ['grammar', 'GRAMMAR', 'Spelling', 'SPELLING'],
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    const weakListSection = call.html.split('Areas to improve:')[1] || '';
    // Unique items: grammar, spelling (case-normalised) → 2 list items
    const liMatches = weakListSection.match(/<li /g) || [];
    expect(liMatches.length).toBe(2);
  });

  test('capitalises each unique weak area', async () => {
    await sendExamScoreEmail('student@test.com', {
      userName: 'Carol',
      score: 85,
      level: 'B2',
      passed: true,
      weakAreas: ['punctuation', 'vocabulary'],
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('Punctuation');
    expect(call.html).toContain('Vocabulary');
  });

  test('shows fallback message when weakAreas is empty', async () => {
    await sendExamScoreEmail('student@test.com', {
      userName: 'Dave',
      score: 95,
      level: 'C1',
      passed: true,
      weakAreas: [],
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('No major weak areas detected');
  });

  test('email subject contains level and score', async () => {
    await sendExamScoreEmail('student@test.com', {
      userName: 'Eve',
      score: 78,
      level: 'B1',
      passed: true,
      weakAreas: ['Grammar'],
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('B1');
    expect(call.subject).toContain('78%');
  });

  test('email is sent to the correct recipient', async () => {
    await sendExamScoreEmail('recipient@test.com', {
      userName: 'Frank',
      score: 55,
      level: 'A2',
      passed: false,
      weakAreas: [],
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe('recipient@test.com');
  });

  test('uses default empty array when weakAreas is omitted', async () => {
    await sendExamScoreEmail('student@test.com', {
      userName: 'Grace',
      score: 88,
      level: 'B2',
      passed: true,
      // weakAreas not provided — should default to []
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('No major weak areas detected');
  });
});

describe('sendOTPEmail', () => {
  test('includes OTP code in email HTML', async () => {
    mockSendMail.mockClear();
    await sendOTPEmail('user@test.com', '123456');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('123456');
    expect(call.subject).toContain('123456');
  });
});

describe('sendWelcomeEmail', () => {
  test('includes userName in email HTML', async () => {
    mockSendMail.mockClear();
    await sendWelcomeEmail('user@test.com', 'TestUser');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('TestUser');
    expect(call.subject).toContain('TestUser');
  });
});
