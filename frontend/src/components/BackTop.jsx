import { useEffect, useState } from 'react';
import { VerticalAlignTopOutlined } from '@ant-design/icons';
import { BACK_TOP_SHOW_Y } from '../constants/timing.js';

/** 长列表回到顶部（使用 .back-top 样式） */
export default function BackTop({ threshold = BACK_TOP_SHOW_Y }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setIsVisible(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      className="back-top"
      aria-label="回到顶部"
      title="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <VerticalAlignTopOutlined />
    </button>
  );
}
