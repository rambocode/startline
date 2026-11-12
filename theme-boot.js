// 首帧前套用外观：读扩展页面共享的 localStorage，暗色用户不会先看到一闪浅色。
// 必须在 <head> 里同步加载；真正的设置读到后由 UI.applyAppearance 校正并回写这里的缓存
(() => {
  let mode = 'light';
  let motion = 'on';
  try {
    mode = localStorage.getItem('sl-mode') || mode;
    motion = localStorage.getItem('sl-motion') || motion;
  } catch (e) { /* 存储不可用时按默认外观 */ }
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.motion = motion;
})();
