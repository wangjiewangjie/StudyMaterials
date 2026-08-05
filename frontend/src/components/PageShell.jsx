/**
 * 页面主容器：统一 max-width / 内边距 / 入场动画。
 * home 模式去掉顶部大间距（首页有 sticky 标签栏）。
 */
export default function PageShell({ children, className = '', home = false }) {
  return (
    <main className={`${home ? 'home-page' : 'page-main'} rise-in ${className}`.trim()}>
      {children}
    </main>
  );
}
