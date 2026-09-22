import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { ContextLensOnboarding, LanguageToggle } from './ContextLensOnboarding';

describe('bilingual onboarding', () => {
  afterEach(() => { render(null, document.body); });

  it('renders Vietnamese guidance and language controls', () => {
    render(<ContextLensOnboarding language="vi" onLanguageChange={() => {}} onClose={() => {}} />, document.body);
    expect(document.body.textContent).toContain('Đọc → Lưu → Ôn tập');
    expect(document.body.textContent).toContain('Context Lens và English101 là hai ứng dụng riêng');
    expect(document.querySelector('[aria-pressed="true"]')?.textContent).toBe('VN');
  });

  it('exposes compact EN and VN choices', () => {
    render(<LanguageToggle language="en" onChange={() => {}} />, document.body);
    expect(Array.from(document.querySelectorAll('button')).map(button => button.textContent)).toEqual(['EN', 'VN']);
  });
});
