import { describe, it, vi, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { PdfModeSwitch } from './PdfModeSwitch';
import type { GuideLanguage } from '../../onboarding/store';

describe('PdfModeSwitch', () => {
  const onOriginal = vi.fn();
  const onReading = vi.fn();

  it.each([
    ['en', 'PDF', 'Text'],
    ['vi', 'Trang gốc', 'Đọc chữ'],
  ])('renders correct labels for language %s', (uiLanguage, originalLabel, readingLabel) => {
    const { getByRole } = render(<PdfModeSwitch
      mode="original"
      uiLanguage={uiLanguage as GuideLanguage}
      canRead={true}
      onOriginal={onOriginal}
      onReading={onReading}
    />);
    const selected = getByRole('button', { name: originalLabel });
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: readingLabel })).toBeTruthy();
  });

  it.each([
    ['en', 'PDF', 'Text'],
    ['vi', 'Trang gốc', 'Đọc chữ'],
  ])('switches to reading mode for language %s', (uiLanguage, originalLabel, readingLabel) => {
    const { getByRole } = render(<PdfModeSwitch
      mode="original"
      uiLanguage={uiLanguage as GuideLanguage}
      canRead={true}
      onOriginal={onOriginal}
      onReading={onReading}
    />);
    expect(getByRole('button', { name: originalLabel }).getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: readingLabel })).toBeTruthy();

    // Click the reading button
    getByRole('button', { name: readingLabel }).click();
    expect(onReading).toHaveBeenCalledTimes(1);
    expect(onOriginal).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'PDF', 'Text'],
    ['vi', 'Trang gốc', 'Đọc chữ'],
  ])('switches to original mode for language %s', (uiLanguage, originalLabel, readingLabel) => {
    const { getByRole } = render(<PdfModeSwitch
      mode="reading"
      uiLanguage={uiLanguage as GuideLanguage}
      canRead={true}
      onOriginal={onOriginal}
      onReading={onReading}
    />);
    expect(getByRole('button', { name: readingLabel }).getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: originalLabel })).toBeTruthy();

    // Click the original button
    getByRole('button', { name: originalLabel }).click();
    expect(onOriginal).toHaveBeenCalledTimes(1);
    expect(onReading).not.toHaveBeenCalled();
  });

  it('disables reading button when cannot read', () => {
    const { getByRole } = render(<PdfModeSwitch
      mode="original"
      uiLanguage="en"
      canRead={false}
      onOriginal={onOriginal}
      onReading={onReading}
    />);
    expect(getByRole('button', { name: 'PDF' }).getAttribute('aria-pressed')).toBe('true');
    const readingBtn = getByRole('button', { name: 'Text' });
    expect(readingBtn.hasAttribute('disabled')).toBe(true);
  });
});