// Breadcord Core
document.body.innerHTML += '<h1> yahoo</h1>';
BreadAPI.ready.then(() => {
    BreadAPI.info('Renderer is ready');
    BreadAPI.alert('Hello from BreadAPI!');
  });

window.BreadAPI.gateway.on_message((msg) => {
  BreadAPI.info('Gateway message received! ' + JSON.stringify(msg));
});
