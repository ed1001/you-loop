export default defineBackground(() => {
  console.log("You Loop background loaded.", { id: browser.runtime.id });
});
