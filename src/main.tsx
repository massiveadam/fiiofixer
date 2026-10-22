import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/cinzel-decorative/latin-700.css';
import './style.css';
import './dracula.css';
import { App } from './App';
import { applyTheme, readTheme } from './theme';

applyTheme(readTheme());

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root.');
ReactDOM.createRoot(root).render(<React.StrictMode><App/></React.StrictMode>);
