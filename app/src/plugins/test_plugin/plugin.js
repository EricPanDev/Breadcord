BreadUI.create_type("message", { padding: "8px 12px", borderRadius: "8px", background: "#f5f5f5", margin: "6px 0" });
BreadUI.create_type("stack", { display: "flex", flexDirection: "column", gap: "8px" });

BreadUI.before_dom_addition("message", (self, parent) => {
  if (self instanceof UIElement && typeof self.data.text === "string") {
    self.data.text = self.data.text.toUpperCase();
  }
});

const root = BreadUI.create_container("root", "stack", { maxWidth: "420px" });
const msg1 = BreadUI.create_element("message", {}, { text: "hello world" });
const msg2 = BreadUI.create_element("message", { background: "#e8f0fe" }, { text: "custom style" });

root.add(msg1).add(msg2);
root.mount("#app");