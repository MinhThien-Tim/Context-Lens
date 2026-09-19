import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles.css';

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new Event('context-lens:update-ready'));
  }
});
render(<App />, document.getElementById('app')!);
