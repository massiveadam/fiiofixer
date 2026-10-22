import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root.');
ReactDOM.createRoot(root).render(<React.StrictMode><App/></React.StrictMode>);
