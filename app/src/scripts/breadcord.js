// Breadcord Core
document.body.innerHTML += '<h1> yahoo</h1>';
BreadAPI.ready.then(() => {
    BreadAPI.info('Renderer is ready');
    BreadAPI.alert('Hello from BreadAPI!');
  });