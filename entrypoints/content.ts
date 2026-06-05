export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  main() {
    console.log("You Loop content script loaded.");
  },
});
