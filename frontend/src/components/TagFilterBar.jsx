import { useCallback, useEffect, useRef, useState } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

/**
 * 现代视频站风格标签栏：
 * 横向滑动、左右箭头（text 样式）、边缘渐隐、选中项滚入视野、拖拽/滚轮横滑。
 */
export default function TagFilterBar({ tags = [], activeTag = '', onTagChange }) {
  const scrollerRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 4);
    setCanRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    updateArrows();
    const onScroll = () => updateArrows();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateArrows) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateArrows);
    };
  }, [tags, updateArrows]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const key = activeTag || '__all__';
    const chip = Array.from(el.querySelectorAll('[data-tag]')).find(
      (n) => n.getAttribute('data-tag') === key
    );
    if (!chip) return;
    chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    const t = window.setTimeout(updateArrows, 320);
    return () => window.clearTimeout(t);
  }, [activeTag, tags, updateArrows]);

  const scrollByDir = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = Math.max(200, Math.floor(el.clientWidth * 0.65)) * dir;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const selectTag = (tag) => {
    // 拖拽横滑时不触发筛选
    if (dragRef.current.moved) return;
    onTagChange(tag);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const el = scrollerRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) <= 4) return;
    if (!dragRef.current.moved) {
      dragRef.current.moved = true;
      el.classList.add('is-dragging');
      // 确认拖拽后再捕获指针，避免拦截标签 click
      try { el.setPointerCapture(dragRef.current.pointerId); } catch (_) { /* ignore */ }
    }
    el.scrollLeft = dragRef.current.scrollLeft - dx;
  };

  const endDrag = (e) => {
    if (!dragRef.current.active) return;
    const el = scrollerRef.current;
    const wasDragging = dragRef.current.moved;
    dragRef.current.active = false;
    if (el) {
      el.classList.remove('is-dragging');
      if (wasDragging) {
        try { el.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
    }
    if (wasDragging) {
      window.setTimeout(() => { dragRef.current.moved = false; }, 50);
    } else {
      dragRef.current.moved = false;
    }
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (absX > absY) return;
      if (!e.shiftKey && absY < 1) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const chips = [
    { key: '__all__', label: '全部', value: '' },
    ...tags.map(({ tag }) => ({ key: tag, label: tag, value: tag })),
  ];

  return (
    <div className="home-filter-bar sticky top-16 z-[190] backdrop-blur-xl border-b border-white/10">
      <div className="tag-bar max-w-7xl mx-auto px-1 sm:px-4 lg:px-6 relative">
        <button
          type="button"
          aria-label="向左滚动标签"
          className={`tag-bar-arrow tag-bar-arrow-left ${canLeft ? 'is-visible' : ''}`}
          onClick={() => scrollByDir(-1)}
          tabIndex={canLeft ? 0 : -1}
        >
          <LeftOutlined />
        </button>

        <div
          className={`tag-bar-fade tag-bar-fade-left ${canLeft ? 'is-visible' : ''}`}
          aria-hidden
        />
        <div
          className={`tag-bar-fade tag-bar-fade-right ${canRight ? 'is-visible' : ''}`}
          aria-hidden
        />

        <div
          ref={scrollerRef}
          className="tag-scroll flex items-center gap-2 overflow-x-auto whitespace-nowrap py-2.5 px-8 sm:px-10"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {chips.map(({ key, label, value }) => {
            const checked = value === '' ? !activeTag : activeTag === value;
            return (
              <button
                key={key}
                type="button"
                data-tag={key}
                className={`tag-chip ${checked ? 'is-active' : ''}`}
                onClick={() => selectTag(checked && value !== '' ? '' : value)}
              >
                {value === '' ? label : `#${label}`}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="向右滚动标签"
          className={`tag-bar-arrow tag-bar-arrow-right ${canRight ? 'is-visible' : ''}`}
          onClick={() => scrollByDir(1)}
          tabIndex={canRight ? 0 : -1}
        >
          <RightOutlined />
        </button>
      </div>
    </div>
  );
}
