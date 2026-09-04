/**
 * 页面主容器。home 不用 rise-in：transform 动画会破坏内部 fixed 顶栏。
 */
export default function PageShell({ children, home = false }) {
  return (
    <main id="main-content" className={home ? 'home-page' : 'page-main rise-in'}>
      {children}
    </main>
  );
}
