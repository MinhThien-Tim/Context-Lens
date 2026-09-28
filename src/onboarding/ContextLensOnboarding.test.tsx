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

  it('documents the offline flow in both guide languages', () => {
    render(<ContextLensOnboarding language="en" onLanguageChange={() => {}} onClose={() => {}} />, document.body);
    expect(document.querySelector('.guide-offline h3')?.textContent).toBe('Use Context Lens offline');
    expect(document.body.textContent).toContain('Works offline: reading, local dictionary, notes, highlights, and reading progress.');
    expect(document.body.textContent).toContain('Needs Internet: web results, online translation, and external providers.');
    render(null, document.body);
    render(<ContextLensOnboarding language="vi" onLanguageChange={() => {}} onClose={() => {}} />, document.body);
    expect(document.querySelector('.guide-offline h3')?.textContent).toBe('Dùng Context Lens khi ngoại tuyến');
    expect(document.body.textContent).toContain('Dùng được ngoại tuyến: đọc sách, từ điển cục bộ, ghi chú, tô sáng và tiến độ đọc.');
    expect(document.body.textContent).toContain('Cần Internet: kết quả web, dịch trực tuyến và dịch vụ bên ngoài.');
  });

  it('exposes compact EN and VN choices', () => {
    render(<LanguageToggle language="en" onChange={() => {}} />, document.body);
    expect(Array.from(document.querySelectorAll('button')).map(button => button.textContent)).toEqual(['EN', 'VN']);
  });
});
