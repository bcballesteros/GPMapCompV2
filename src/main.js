import 'ol/ol.css';
import './styles/main.css';
import './styles/components.css';
import { bootstrapApp } from './app/bootstrap.js';

function mountApp() {
    bootstrapApp();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountApp, { once: true });
} else {
    mountApp();
}
