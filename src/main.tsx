import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PracticeView } from './components/PracticeView';
import { Stage } from './components/Stage';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Stage>
      <PracticeView />
    </Stage>
  </StrictMode>,
);
