/**
 * 页面横幅：收藏库 / 同步中心共用。
 * icon / title / subtitle 左侧；actions 右侧。
 * icon 直接展示，不再套色块容器。
 */
export default function PageBanner({ icon, title, subtitle, actions, largeIcon = false }) {
  return (
    <section className="page-banner">
      <div className="page-banner-inner">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon ? (
            <span className={`page-banner-icon${largeIcon ? ' is-lg' : ''}`} aria-hidden>
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter text-white m-0 leading-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-xs text-ph-text-tertiary mt-1 mb-0">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div> : null}
      </div>
    </section>
  );
}
