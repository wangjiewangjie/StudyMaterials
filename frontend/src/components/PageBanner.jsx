/**
 * 页面横幅：收藏库 / 同步中心共用。
 * icon / title / subtitle 左侧；actions 右侧。
 */
export default function PageBanner({ icon, title, subtitle, actions, largeIcon = false }) {
  return (
    <section className="page-banner">
      <div className="page-banner-inner">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`page-banner-icon${largeIcon ? ' is-lg' : ''}`}>{icon}</div>
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
