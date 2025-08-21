import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ace from 'ace-builds'; 

ace.config.setModuleUrl('ace/mode/javascript_worker', '/worker-javascript.js');


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
