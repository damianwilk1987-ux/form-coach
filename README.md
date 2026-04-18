<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#080810" />
    <title>FormCoach – AI Analiza Techniki</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />

    <!-- MediaPipe Vision Tasks -->
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js" crossorigin="anonymous"></script>

    <style>
      body { margin: 0; background: #080810; }
      #root { min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
    <script>
      // Wyeksportuj MediaPipe do globalnego scope dla React
      document.addEventListener('DOMContentLoaded', () => {
        if (window.mpVision) {
          window.FilesetResolver = window.mpVision.FilesetResolver;
          window.PoseLandmarker = window.mpVision.PoseLandmarker;
        }
      });
    </script>
  </body>
</html>
