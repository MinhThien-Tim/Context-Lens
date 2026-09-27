import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles.css';

const applyUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new Event('context-lens:update-ready'));
  }
});
window.addEventListener('context-lens:apply-update', () => { void applyUpdate(true); });
render(<App />, document.getElementById('app')!);
