/**
 * 页面主容器：统一 max-width / 内边距 / 入场动画。
 * home 模式无顶部大间距（顶栏 sticky，标签栏紧随其后）。
 */
export default function PageShell({ children, home = false }) {
  return (
    <main className={`${home ? 'home-page' : 'page-main'} rise-in`}>
      {children}
    </main>
  );
}
