/* ============ sections ============ */
import React, { useState, useEffect, useRef } from 'react'
import { Ico, I, MODES, SWATCHES, BUTTONS, NATIVE_ACTIONS, SHORTCUT_PRESETS, POLLING, DPI_MAX, USB_LED_COLOR, USB_CHARGED_COLOR } from './data.jsx'
import { tModeDesc, LANGS, ACCENTS } from './i18n.jsx'
import { MouseStage, MouseFrame } from './mouse.jsx'

/* ---- shared ---- */
export function Panel({label, idx, right, children, className}){
  return (
    <div className={'panel '+(className||'')}>
      <span className="corner tl"></span><span className="corner br"></span>
      {(label||right) && (
        <div className="panel-h">
          <div className="pl">{idx&&<span style={{color:'var(--live)'}}>{idx}</span>}<b>{label}</b></div>
          <div className="pi">{right}</div>
        </div>
      )}
      {children}
    </div>
  )
}
export function Toggle({on,onClick}){return <button className={'toggle'+(on?' on':'')} onClick={onClick}><i></i></button>}
export function Seg({options,value,onChange,live}){
  return <div className={'seg'+(live?' live':'')}>{options.map(o=>(
    <button key={o.v??o} className={(value===(o.v??o))?'on':''} disabled={!!o.disabled} onClick={()=>!o.disabled&&onChange(o.v??o)}>{o.l??o}</button>
  ))}</div>
}
function RowToggle({label,sub,on,onClick}){
  return <div className="row" style={{padding:'4px 0'}}>
    <div><div style={{fontSize:'12px'}}>{label}</div>{sub&&<div className="muted" style={{fontSize:'10px',marginTop:'2px'}}>{sub}</div>}</div>
    <Toggle on={on} onClick={onClick}/>
  </div>
}

/* ===================== CONSOLE ===================== */
export function ConsoleSection({ctx}){
  const {state, mouseProps, t, connected, connecting, reconnect, usbCharged, usbColor} = ctx
  const usbConn = state.conn==='usb'
  const btConn  = state.conn==='bluetooth'
  const battColor = state.batt<15?'var(--danger)':state.batt<30?'var(--warn)':'var(--good)'
  const activeStage = state.dpi[state.activeStage]
  const activeColor = usbConn ? (usbColor||USB_LED_COLOR) : activeStage.color

  function connLabel() {
    if (!connected) return t('sb.disconnected')
    if (state.conn==='usb')       return t('con.cable')
    if (state.conn==='bluetooth') return t('con.bluetooth')
    return t('con.dongle')
  }

  return (
    <div className="cockpit fade-in">
      <div className="col">
        <Panel label={t('con.connection')} idx="01">
          <div className="row" style={{marginBottom:'12px'}}>
            <div className="k">{t('con.interface')}</div>
            <div className="v" style={{display:'flex',alignItems:'center',gap:'7px'}}>
              <span className={'conn-dot'+(connected?' ok':'')} style={{position:'static'}}></span>
              {connLabel()}
            </div>
          </div>
          {btConn && (
            <div className="tiny" style={{color:'var(--dim)',marginBottom:'10px'}}>{t('con.bt.limited')}</div>
          )}
          <div className="divider"></div>
          <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
            <button className="btn" style={{flex:1}} onClick={reconnect} disabled={connecting}>
              {connecting ? t('con.searching') : connected ? t('con.reconnect') : t('con.findmouse')}
            </button>
            {!connected && (
              <button className="btn" style={{flex:'0 0 auto',padding:'0 12px'}}
                title={t('con.bluetooth')}
                onClick={()=>reconnect('bluetooth')}
                disabled={connecting}>
                BT
              </button>
            )}
          </div>
          <RowToggle label={t('con.autorecon')} sub={t('con.autorecon.s')} on={state.autoReconnect} onClick={()=>ctx.set({autoReconnect:!state.autoReconnect})}/>
        </Panel>
        <Panel label={t('con.battery')} idx="02">
          {usbConn ? (
            <>
              <div style={{display:'flex',alignItems:'baseline',gap:'8px',marginBottom:'14px'}}>
                <span style={{color:usbColor,display:'inline-flex',width:22,height:22,flexShrink:0,alignSelf:'center'}} dangerouslySetInnerHTML={{__html:usbCharged?I.batt:I.bolt}}/>
                <div className="big-num" style={{color:usbColor,fontSize:'26px'}}>{usbCharged?t('con.charged'):t('con.charging')}</div>
                <div className="tiny" style={{color:'var(--dim)'}}>USB-C</div>
              </div>
              <div className="batt-bar" style={{width:'100%',height:'6px'}}>
                {usbCharged
                  ? <i style={{display:'block',height:'100%',borderRadius:'3px',width:'100%',background:USB_CHARGED_COLOR}}></i>
                  : <i className="batt-charge-fill"></i>
                }
              </div>
            </>
          ) : (
            <>
              <div className="big-num" style={{color:battColor}}>{state.batt}<span className="unit">%</span></div>
              <div className="batt-bar" style={{width:'100%',height:'8px',marginTop:'12px'}}><i style={{width:state.batt+'%',background:battColor}}></i></div>
              {state.batt<30 && <div className="tiny" style={{marginTop:'10px',color:'var(--warn)'}}>⚠ {t('con.battoverride')}</div>}
            </>
          )}
        </Panel>
      </div>

      <div className="center-col">
        <MouseFrame caption={t('con.live')}>
          <MouseStage {...mouseProps}/>
        </MouseFrame>
        <div style={{display:'flex',gap:'10px'}}>
          <div className="stat" style={{textAlign:'center',minWidth:'110px'}}><div className="sl">{t('con.activedpi')}</div><div className="sv" style={{justifyContent:'center',color:activeColor}}>{activeStage.dpi.toLocaleString()}</div></div>
          <div className="stat" style={{textAlign:'center',minWidth:'110px'}}><div className="sl">POLLING</div><div className="sv" style={{justifyContent:'center'}}>{btConn ? 125 : state.polling}<small>Hz</small></div></div>
        </div>
      </div>

      <div className="col">
        <Panel label={t('con.devlog')} idx="03" right="LIVE">
          <div className="log">
            {state.log.map((l,i)=>(
              <div className="ln" key={i}>
                <span className="tt">{l.t}</span>
                <span className={'tg '+l.cls}>[{l.tag}]</span>
                <span className="mg">{l.m}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel label={t('con.summary')} idx="04">
          <div className="stack" style={{gap:'9px'}}>
            <div className="row"><span className="k">{t('con.profile')}</span><span className="v" style={{color:'var(--live)'}}>{state.profiles[state.activeProfile]?.name??'—'}</span></div>
            <div className="row"><span className="k">{t('con.lightmode')}</span><span className="v">{MODES.find(m=>m.id===state.mode)?.name??'Off'}</span></div>
            <div className="row"><span className="k">Angle snap</span><span className="v">{state.angleSnap?'ON':'OFF'}</span></div>
            <div className="row"><span className="k">Ripple control</span><span className="v">{state.ripple?'ON':'OFF'}</span></div>
            <div className="row"><span className="k">{t('con.debounce')}</span><span className="v">{state.debounce} ms</span></div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ===================== DPI ===================== */
const USB_LED = USB_LED_COLOR

export function DpiSection({ctx}){
  const {state, t} = ctx
  const usbConn = state.conn==='usb'
  const sel = state.activeStage
  const stage = state.dpi[sel]
  const ledColor = usbConn ? USB_LED : stage.color
  const setDpi = (v)=>{ const d=[...state.dpi]; d[sel]={...d[sel],dpi:v}; ctx.set({dpi:d}) }
  return (
    <div className="cockpit fade-in">
      <div className="col">
        <Panel label={t('dpi.stages')} idx="01" right={t('dpi.slots')}>
          <div className="dpi-stages">
            {state.dpi.map((d,i)=>(
              <div key={i} className={'dpi-stage'+(i===sel?' active':'')} style={{'--stage': usbConn ? USB_LED : d.color}} onClick={()=>ctx.set({activeStage:i})}>
                <div className="swatch"></div>
                <div><div className="lvl">{t('dpi.stage')} {i+1}</div><div className="dpiv">{d.dpi.toLocaleString()}<span className="unit" style={{marginLeft:'4px'}}>DPI</span></div></div>
                <div className="actag">{t('dpi.active')}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="center-col">
        <MouseFrame caption={t('dpi.stage')+' '+(sel+1)+' · '+stage.dpi.toLocaleString()+' DPI'}>
          <MouseStage {...ctx.mouseProps} glow={ledColor} mode="staticdpi" lit={true}/>
        </MouseFrame>
        <div className="big-num" style={{color:ledColor,fontSize:'46px'}}>{stage.dpi.toLocaleString()}<span className="unit" style={{fontSize:'13px',marginLeft:'8px'}}>DPI</span></div>
      </div>

      <div className="col">
        <Panel label={t('dpi.adjust')+' '+(sel+1)} idx="02">
          <div className="row" style={{marginBottom:'14px'}}>
            <span className="k">{t('dpi.resolution')}</span>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <button className="btn sm" onClick={()=>setDpi(Math.max(50,stage.dpi-50))}>−</button>
              <span className="v" style={{minWidth:'58px',textAlign:'center',fontWeight:600}}>{stage.dpi.toLocaleString()}</span>
              <button className="btn sm" onClick={()=>setDpi(Math.min(DPI_MAX,stage.dpi+50))}>+</button>
            </div>
          </div>
          <input type="range" min="50" max={DPI_MAX} step="50" value={stage.dpi} onChange={e=>setDpi(+e.target.value)}/>
          <div className="row" style={{marginTop:'6px'}}><span className="tiny">50</span><span className="tiny">{DPI_MAX.toLocaleString()}</span></div>
          <div className="divider"></div>
          <div className={usbConn ? 'usb-dim' : ''}>
            <div className="row" style={{marginBottom:'10px'}}>
              <span className="k">{t('dpi.ledcolor')}</span>
              <span className="swatch" style={{width:'16px',height:'16px',borderRadius:'5px',background:ledColor,boxShadow:'0 0 8px '+ledColor}}></span>
            </div>
            <div className="swatches">
              {SWATCHES.map(c=>(
                <button key={c} className={'sw'+(stage.color===c?' on':'')} style={{background:c}} onClick={()=>{const d=[...state.dpi];d[sel]={...d[sel],color:c};ctx.set({dpi:d});}}></button>
              ))}
            </div>
          </div>
          {usbConn && <div className="usb-notice"><span dangerouslySetInnerHTML={{__html:I.bolt}} style={{width:12,height:12,display:'inline-block'}}/>{t('dpi.ledlock')}</div>}
        </Panel>
        <Panel label={t('dpi.motion')} idx="03">
          <RowToggle label="Angle snap" sub={t('dpi.anglesnap.s')} on={state.angleSnap} onClick={()=>ctx.set({angleSnap:!state.angleSnap})}/>
          <div className="divider"></div>
          <RowToggle label="Ripple control" sub={t('dpi.ripple.s')} on={state.ripple} onClick={()=>ctx.set({ripple:!state.ripple})}/>
        </Panel>
      </div>
    </div>
  )
}

/* ===================== LIGHTING ===================== */
export function LightingSection({ctx}){
  const {state, t, lang} = ctx
  const usbConn = state.conn==='usb'
  const needsColor = ['static','breathing'].includes(state.mode)
  const hasSpeed   = ['breathing','neon','colorbreathing','breathingdpi'].includes(state.mode)
  return (
    <div className="cockpit fade-in">
      <div className="col">
        <Panel label={t('lt.modes')} idx="01" right={t('lt.count')}>
          <div className={`modes${usbConn?' usb-dim':''}`}>
            {MODES.map(m=>(
              <button key={m.id} className={'mode-card'+(state.mode===m.id?' on':'')} onClick={()=>!usbConn&&ctx.set({mode:m.id})}>
                <div className="mn"><span className="mdot"></span>{m.name}</div>
                <div className="md">{tModeDesc(m.id,lang)}</div>
              </button>
            ))}
          </div>
        </Panel>
        <div style={{padding:'4px 0'}}>
          <RowToggle label={t('lt.battoverride')} sub={t('lt.battoverride.s')} on={state.battOverride} onClick={()=>ctx.set({battOverride:!state.battOverride})}/>
        </div>
      </div>

      <div className="center-col">
        <MouseFrame caption={usbConn ? 'STATIC · USB' : (MODES.find(m=>m.id===state.mode)?.name??'Off').toUpperCase()+' · '+t('lt.preview')}>
          <MouseStage {...ctx.mouseProps} glow={usbConn ? USB_LED : ctx.mouseProps.glow} mode={usbConn ? 'static' : ctx.mouseProps.mode}/>
        </MouseFrame>
        <div className="muted" style={{fontSize:'10px',letterSpacing:'.08em',textAlign:'center',maxWidth:'280px',lineHeight:1.5}}>
          {usbConn ? '' : t('lt.note')}
        </div>
        {usbConn
          ? <div className="usb-notice" style={{justifyContent:'center',gap:'8px'}}>
              <span dangerouslySetInnerHTML={{__html:I.bolt}} style={{width:14,height:14,display:'inline-block'}}/>
              {t('lt.usblock')}
            </div>
          : <button className="btn primary lt-apply-btn" onClick={ctx.applyLighting} disabled={!ctx.connected}>
              ▶ {t('lt.apply')}
            </button>
        }
      </div>

      <div className="col">
        {needsColor && (
          <Panel label={t('lt.global')} idx="02">
            <div className={usbConn ? 'usb-dim' : ''}>
              <div className="swatches">
                {SWATCHES.map(c=>(
                  <button key={c} className={'sw'+(state.color===c?' on':'')} style={{background:c}} onClick={()=>ctx.set({color:c})}></button>
                ))}
              </div>
              <div className="row" style={{marginTop:'14px'}}>
                <span className="k">{t('lt.picker')}</span>
                <label className="btn sm" style={{cursor:'pointer'}}>
                  <span style={{width:'13px',height:'13px',borderRadius:'4px',background:state.color,display:'inline-block'}}></span>{state.color.toUpperCase()}
                  <input type="color" value={state.color} onChange={e=>ctx.set({color:e.target.value})} style={{width:0,height:0,opacity:0,position:'absolute'}}/>
                </label>
              </div>
            </div>
          </Panel>
        )}
        {hasSpeed && (
          <Panel label={t('lt.effect')} idx="03">
            <div className={usbConn ? 'usb-dim' : ''}>
              <div className="row" style={{marginBottom:'10px'}}><span className="k">{t('lt.speed')}</span><span className="v">{state.speed}×</span></div>
              <input type="range" min="1" max="10" step="1" value={state.speed} onChange={e=>ctx.set({speed:+e.target.value})}/>
              <div className="row" style={{marginTop:'6px'}}><span className="tiny">{t('lt.slow')}</span><span className="tiny">{t('lt.fast')}</span></div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

/* ===================== KEY CAPTURE ===================== */
function KeyCapture({binding,onSet,t}){
  const [cap,setCap] = useState(false)
  const [live,setLive] = useState(null)
  useEffect(()=>{
    if(!cap) return
    const handler=(e)=>{
      e.preventDefault(); e.stopPropagation()
      const mods=[]
      if(e.ctrlKey)mods.push('Ctrl'); if(e.altKey)mods.push('Alt'); if(e.shiftKey)mods.push('Shift'); if(e.metaKey)mods.push('Super')
      const k=e.key
      const isMod=['Control','Alt','Shift','Meta','OS'].includes(k)
      const keyName=isMod?'':(k===' '?'Space':k.length===1?k.toUpperCase():k)
      setLive({mods,key:keyName})
      if(!isMod){ onSet({mods,key:keyName}); setCap(false); setTimeout(()=>setLive(null),300) }
    }
    window.addEventListener('keydown',handler,true)
    return ()=>window.removeEventListener('keydown',handler,true)
  },[cap])
  const cur = (cap&&live) || (binding&&binding.type==='shortcut'?{mods:binding.mods,key:binding.key}:null)
  const txt = cur && (cur.mods.length||cur.key) ? [...cur.mods,cur.key].filter(Boolean).join(' + ') : (cap? t('bt.capturing') : t('bt.noshortcut'))
  return (
    <div className={'keycap'+(cap?' on':'')} onClick={()=>setCap(c=>!c)}>
      <span className="keycap-d">{txt}</span>
      <span className="keycap-b">{cap?t('bt.cancel'):t('bt.capture')}</span>
    </div>
  )
}

/* ===================== BUTTONS ===================== */
export function ButtonsSection({ctx}){
  const {state, t, lang, tAct, applyBindings, connected} = ctx
  const [sel,setSel] = useState('left')
  const bd = state.bindings[sel] || {type:'native',action:'Clique Esquerdo'}
  const [tab,setTab] = useState(bd.type||'native')
  const selBtn = BUTTONS.find(b=>b.id===sel)
  const setBind = (val)=>ctx.set({bindings:{...state.bindings,[sel]:val}})
  const pick = (id)=>{ setSel(id); setTab((state.bindings[id]||{type:'native'}).type||'native') }
  const goTab = (tb)=>{ setTab(tb) }
  const dispBind = (b)=>{ if(!b) return '—'
    if(b.type==='shortcut') return [...(b.mods||[]),b.key].filter(Boolean).join(' + ')||'—'
    if(b.type==='custom_macro') { const m = state.macroLibrary?.find(x=>x.id===b.macroId); return m ? 'Macro: '+m.name : 'Macro' }
    return tAct(b.action) }
  const typeTag = (ty)=> (ty==='shortcut'?t('bt.tab.shortcut'):ty==='custom_macro'?'MACRO':t('bt.tab.native')).toUpperCase()

  const setBindMacro = (macId) => {
    let newBindings = {...state.bindings}
    let resetCount = 0
    for (const k in newBindings) {
      if (k !== sel && newBindings[k].type === 'custom_macro') {
        const defaultAction = BUTTONS.find(b=>b.id===k)?.def || 'Clique Esquerdo'
        newBindings[k] = {type:'native', action: defaultAction}
        resetCount++
      }
    }
    newBindings[sel] = {type:'custom_macro', macroId: macId}
    
    const macData = state.macroLibrary?.find(m=>m.id===macId)
    const btnEnumMap = {left:0, right:1, middle:2, forward:3, backward:4, dpi:5}
    const macroPatch = macData ? {
      enabled: true,
      targetButton: btnEnumMap[sel] ?? 4,
      mode: macData.mode,
      repeat: macData.repeat,
      events: macData.events
    } : {enabled: false}

    if(resetCount > 0 && ctx.showToast) {
      ctx.showToast('Предыдущий макрос сброшен (аппаратный лимит)', true)
    }

    ctx.set({bindings: newBindings, customMacro: {...state.customMacro, ...macroPatch}})
  }

  return (
    <div className="cockpit fade-in">
      <div className="col">
        <Panel label={t('bt.map')} idx="01" right={t('bt.count')}>
          <div className="btnmap">
            {BUTTONS.map(b=>{
              const bb=state.bindings[b.id]
              return (
                <div key={b.id} className={'bm-row'+(sel===b.id?' sel':'')} onClick={()=>pick(b.id)}>
                  <div className="bi"><Ico n="buttons"/></div>
                  <div style={{minWidth:0}}>
                    <div className="bl">{t('btn.'+b.id)}</div>
                    <div className="bm-tag">{typeTag(bb.type)}</div>
                  </div>
                  <div className="ba" title={dispBind(bb)}>{dispBind(bb)}</div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      <div className="center-col">
        <MouseFrame caption={t('bt.hint')}>
          <MouseStage {...ctx.mouseProps} mapMode={true} activeButton={sel} positions={state.btnPos} onPick={pick}/>
        </MouseFrame>
      </div>

      <div className="col">
        <Panel label={t('bt.reassign')+' · '+t('btn.'+sel)} idx="02">
          <div className="tiny" style={{marginBottom:'8px'}}>{t('bt.current')}</div>
          <div className="row" style={{marginBottom:'14px'}}>
            <span style={{fontSize:'15px',fontFamily:'Archivo',fontWeight:700,color:'var(--live)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{dispBind(bd)}</span>
            <button className="btn sm ghost" onClick={()=>setBind({type:'native',action:selBtn.def})}><Ico n="reset"/>{t('bt.default')}</button>
          </div>
          <Seg live options={[{v:'native',l:t('bt.tab.native')},{v:'shortcut',l:t('bt.tab.shortcut')},{v:'custom_macro',l:t('nav.macro')}]} value={tab} onChange={goTab}/>

          {tab==='native' && (
            <div className="act-scroll stack" style={{gap:'14px',marginTop:'14px'}}>
              {NATIVE_ACTIONS.map(grp=>(
                <div key={grp.group}>
                  <div className="tiny" style={{marginBottom:'7px'}}>{t('bt.grp.'+grp.group)}</div>
                  <div className="act-grid">
                    {grp.items.map(a=>(
                      <button key={a} className={'act'+(bd.type==='native'&&bd.action===a?' on':'')} onClick={()=>setBind({type:'native',action:a})}>{tAct(a)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab==='shortcut' && (
            <div style={{marginTop:'14px'}}>
              <KeyCapture binding={bd} onSet={(sc)=>setBind({type:'shortcut',...sc})} t={t}/>
              <div className="tiny" style={{margin:'14px 0 8px'}}>{t('bt.presets')}</div>
              <div className="act-grid">
                {SHORTCUT_PRESETS.map((p,i)=>{
                  const lbl=[...p.mods,p.key].join(' + ')
                  const on=bd.type==='shortcut'&&[...(bd.mods||[]),bd.key].join(' + ')===lbl
                  return <button key={i} className={'act'+(on?' on':'')} onClick={()=>setBind({type:'shortcut',...p})}>{lbl}</button>
                })}
              </div>
            </div>
          )}

          {tab==='custom_macro' && (
            <div style={{marginTop:'14px'}}>
              <div className="tiny" style={{marginBottom:'10px'}}>{t('mc.lib.hint')}</div>
              <div className="prof-list" style={{maxHeight:'200px',overflowY:'auto'}}>
                {state.macroLibrary?.length ? state.macroLibrary.map(mac=>(
                  <div key={mac.id} className={'prof'+(bd.macroId===mac.id?' sel':'')} onClick={()=>setBindMacro(mac.id)} style={{cursor:'pointer'}}>
                    <div className="pdot"></div>
                    <div className="pn">{mac.name}</div>
                  </div>
                )) : <div className="muted" style={{fontSize:'11px'}}>{t('mc.lib.empty')}</div>}
              </div>
            </div>
          )}

          <div style={{marginTop:'16px',borderTop:'1px solid var(--line)',paddingTop:'14px'}}>
            <button className="btn primary lt-apply-btn" style={{width:'100%'}}
              onClick={applyBindings} disabled={!connected}>
              ▶ {t('bt.apply')}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ===================== PERFORMANCE ===================== */
export function PerfSection({ctx}){
  const {state, t, connected, applyBindings} = ctx
  const applyPerf = ctx.applyPerf || applyBindings
  const usbWired    = state.conn === 'usb'
  const bleConn     = state.conn === 'bluetooth'
  const pollingVal  = bleConn ? 125 : state.polling
  const pollingOpts = POLLING.map(p=>({v:p, l:p+'Hz', disabled: bleConn || (usbWired && p !== 125)}))
  const pollingNote = bleConn   ? '⚠ Bluetooth: máx 125 Hz (fixo)'
                    : usbWired  ? '⚠ USB-C mode: max 125 Hz'
                    : t('pf.polling.d')
  return (
    <div className="cockpit fade-in">
      <div className="col">
        <Panel label={t('pf.polling')} idx="01">
          <Seg live options={pollingOpts} value={pollingVal} onChange={v=>ctx.set({polling:v})}/>
          <div className="muted" style={{fontSize:'10px',marginTop:'10px',lineHeight:1.5}}>
            {pollingNote}
          </div>
        </Panel>
        <Panel label={t('pf.debounce')} idx="02">
          <div className="row" style={{marginBottom:'10px'}}>
            <span className="k">{t('pf.keyresp')}</span>
            <span className="v">{state.debounce} ms</span>
          </div>
          <input type="range" min="4" max="50" step="2" value={state.debounce} onChange={e=>ctx.set({debounce:+e.target.value})}/>
          <div className="row" style={{marginTop:'6px'}}>
            <span className="tiny">4ms · {t('pf.fast')}</span>
            <span className="tiny">50ms · {t('pf.safe')}</span>
          </div>
        </Panel>
        <div style={{marginTop:'4px'}}>
          <button className="btn primary lt-apply-btn" style={{width:'100%'}}
            onClick={applyPerf} disabled={!connected}>
            ▶ {t('pf.apply')}
          </button>
        </div>
      </div>

      <div className="center-col">
        <MouseFrame caption={t('sec.perf.h')}>
          <MouseStage {...ctx.mouseProps} sm={true}/>
        </MouseFrame>
        <div className="stat-grid" style={{width:'100%',maxWidth:'300px'}}>
          <div className="stat" style={{textAlign:'center'}}>
            <div className="sl">{t('pf.report')}</div>
            <div className="sv" style={{justifyContent:'center'}}>{pollingVal}<small>Hz</small></div>
          </div>
          <div className="stat" style={{textAlign:'center'}}>
            <div className="sl">{t('pf.interval')}</div>
            <div className="sv" style={{justifyContent:'center'}}>{(1000/pollingVal).toFixed(1)}<small>ms</small></div>
          </div>
        </div>
      </div>

      <div className="col"></div>
    </div>
  )
}


/* ===================== PROFILES ===================== */
export function ProfilesSection({ctx}){
  const {state, t, profileSave, profileLoad, profileDelete, connected} = ctx
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [loadingName, setLoadingName] = useState(null)

  const doSave = async ()=>{
    if(!newName.trim()) return
    await profileSave(newName)
    setNewName(''); setSaving(false)
  }

  const doLoad = async (name)=>{
    setLoadingName(name)
    await profileLoad(name)
    setLoadingName(null)
  }

  const doDelete = async (e, name)=>{
    e.stopPropagation()
    await profileDelete(name)
  }

  return (
    <div className="fade-in two-col">
      <Panel label={t('pr.profiles')} idx="01" right={state.profiles.length+' '+t('pr.saved')}>
        {state.profiles.length===0 && (
          <div className="muted" style={{fontSize:'11px',padding:'8px 0'}}>{t('pr.none')}</div>
        )}
        <div className="prof-list">
          {state.profiles.map((p,i)=>(
            <div key={p.name} className={'prof'+(loadingName===p.name?' loading':'')}
              onClick={()=>connected && doLoad(p.name)}
              style={{cursor:connected?'pointer':'default',opacity:connected?1:.5}}>
              <div className="pdot"></div>
              <div><div className="pn">{p.name}</div></div>
              <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                {loadingName===p.name && <span className="tiny" style={{color:'var(--live)'}}>{t('pr.loading')}</span>}
                <button className="btn sm ghost danger" onClick={e=>doDelete(e, p.name)}>
                  <Ico n="trash"/>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{marginTop:'14px'}}>
          {saving ? (
            <div style={{display:'flex',gap:'8px'}}>
              <input
                className="name-input"
                placeholder={t('pr.nameplaceh')}
                value={newName}
                autoFocus
                onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') doSave(); if(e.key==='Escape'){ setSaving(false); setNewName('') }}}
              />
              <button className="btn sm primary" onClick={doSave} disabled={!newName.trim()}>{t('pr.save')}</button>
              <button className="btn sm ghost" onClick={()=>{ setSaving(false); setNewName('') }}>✕</button>
            </div>
          ) : (
            <div style={{display:'flex',gap:'8px'}}>
              <button className="btn primary" disabled={!connected} onClick={()=>setSaving(true)}>
                <Ico n="save"/>{t('pr.savecur')}
              </button>
            </div>
          )}
        </div>
      </Panel>
      <div className="col">
        <Panel label={t('pr.persist')} idx="02">
          <div className="tiny" style={{marginBottom:'8px'}}>{t('pr.statefile')}</div>
          <div className="codebox">~/.config/opensharkx11/profiles.json</div>
          <div className="divider"></div>
          <div className="stack" style={{gap:'9px'}}>
            <div className="row"><span className="k">{t('pr.ondisk')}</span><span className="v">{state.profiles.length}</span></div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ===================== MACRO EDITOR ===================== */
const HID_MAP = (()=>{
  const m = {Enter:0x28,Escape:0x29,Backspace:0x2a,Tab:0x2b,Space:0x2c,Minus:0x2d,Equal:0x2e,
    BracketLeft:0x2f,BracketRight:0x30,Backslash:0x31,Semicolon:0x33,Quote:0x34,Backquote:0x35,
    Comma:0x36,Period:0x37,Slash:0x38,CapsLock:0x39,Delete:0x4c,Home:0x4a,End:0x4d,
    PageUp:0x4b,PageDown:0x4e,ArrowRight:0x4f,ArrowLeft:0x50,ArrowDown:0x51,ArrowUp:0x52}
  for(let i=0;i<26;i++) m['Key'+String.fromCharCode(65+i)]=0x04+i
  for(let i=1;i<=9;i++) m['Digit'+i]=0x1e+i-1; m.Digit0=0x27
  for(let i=1;i<=12;i++) m['F'+i]=0x3a+i-1
  return m
})()
// Firmware mouse button codes (MouseMacroEvent enum)
const MOUSE_CODES = {
  LEFT:    0xf1,
  RIGHT:   0xf2,
  MIDDLE:  0xf3,
  BACK:    0xf4,
  FORWARD: 0xf5,
}
const MOUSE_BTNS = [
  {code: MOUSE_CODES.LEFT,    label: 'LMB'},
  {code: MOUSE_CODES.RIGHT,   label: 'RMB'},
  {code: MOUSE_CODES.MIDDLE,  label: 'MMB'},
  {code: MOUSE_CODES.BACK,    label: 'Back'},
  {code: MOUSE_CODES.FORWARD, label: 'Fwd'},
]
// Reverse map: HID code → display name (keyboard + mouse)
const HID_REV = (() => {
  const m = Object.fromEntries(Object.entries(HID_MAP).map(([k,v])=>[v,k.replace(/^Key|^Digit/,'')]))
  m[0xf1] = '🖱 LMB'
  m[0xf2] = '🖱 RMB'
  m[0xf3] = '🖱 MMB'
  m[0xf4] = '🖱 Back'
  m[0xf5] = '🖱 Fwd'
  return m
})()

const MACRO_MODES = (t) => [
  {v:0, l:t('mc.mod.nplay')},
  {v:1, l:t('mc.mod.untilkey')},
  {v:2, l:t('mc.mod.hold')},
]
const TARGET_BTNS = [
  {v:0, l:'Left'}, {v:1, l:'Right'}, {v:2, l:'Middle'},
  {v:3, l:'Forward'}, {v:4, l:'Back'}, {v:5, l:'DPI'},
]

export function MacroSection({ctx}){
  const {state, set, t, connected} = ctx
  const macros = state.macroLibrary || []
  const [selId, setSelId] = useState(null)
  const m = macros.find(mac=>mac.id===selId) || null
  const [recording, setRecording] = useState(false)
  const lastTimeRef = useRef(0)

  const saveToLib = async (patch) => {
    if(!m) return
    const updated = {...m, ...patch}
    await window.api.macroSave(updated)
    const list = await window.api.macrosList()
    set({macroLibrary: list})
  }

  const createMacro = async () => {
    const id = Date.now().toString()
    await window.api.macroSave({id, name:t('mc.newname'), events:[], mode:0, repeat:1})
    const list = await window.api.macrosList()
    set({macroLibrary: list})
    setSelId(id)
  }

  const deleteMacro = async (e, id) => {
    e.stopPropagation()
    await window.api.macroDelete(id)
    const list = await window.api.macrosList()
    set({macroLibrary: list})
    if(selId===id) setSelId(null)
  }

  const addEvent = (key, delay, release) => {
    if(!m) return
    saveToLib({events:[...m.events, {key, delay, release}]})
  }

  const addMouseClick = (code) => {
    if(!m) return
    const baseDelay = 50
    const events = [
      ...m.events,
      {key: code, delay: baseDelay, release: false},
      {key: code, delay: baseDelay, release: true},
    ]
    saveToLib({events})
  }

  // record keydown / keyup
  useEffect(()=>{
    if(!recording || !m) return
    lastTimeRef.current = Date.now()
    const handler = (e) => {
      e.preventDefault(); e.stopPropagation()
      if(['Control','Alt','Shift','Meta','OS'].includes(e.key)) return
      const hid = HID_MAP[e.code]
      if(!hid) return
      const now = Date.now()
      const delay = Math.max(1, now - lastTimeRef.current)
      lastTimeRef.current = now
      const release = e.type === 'keyup'
      addEvent(hid, delay, release)
    }
    window.addEventListener('keydown', handler, true)
    window.addEventListener('keyup', handler, true)
    return ()=>{
      window.removeEventListener('keydown', handler, true)
      window.removeEventListener('keyup', handler, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[recording, m?.events?.length])

  const removeEvent = (idx)=>{
    if(!m) return
    const ev = [...m.events]; ev.splice(idx,1)
    saveToLib({events:ev})
  }
  const setDelay = (idx,val)=>{
    if(!m) return
    const ev = [...m.events]; ev[idx] = {...ev[idx], delay:Math.max(1,+val||1)}
    saveToLib({events:ev})
  }
  const setKey = (idx, key)=>{
    if(!m) return
    const ev = [...m.events]; ev[idx] = {...ev[idx], key:parseInt(key)}
    saveToLib({events:ev})
  }

  const clearAll = ()=> { if(m) saveToLib({events:[]}) }

  return (
    <div className="fade-in" style={{display:'flex',gap:'20px',height:'100%'}}>
      {/* ── COL 1: Library List ───────────────────────── */}
      <div className="col" style={{flex:'0 0 220px'}}>
        <Panel label={t('mc.lib')} idx="01" right={macros.length}>
          <div className="prof-list" style={{maxHeight:'380px',overflowY:'auto',marginBottom:'10px'}}>
            {macros.map(mac=>(
              <div key={mac.id} className={'prof'+(selId===mac.id?' sel':'')} onClick={()=>setSelId(mac.id)} style={{cursor:'pointer'}}>
                <div className="pdot"></div>
                <div style={{flex:1}}>
                  <input className="name-input" style={{width:'100%',background:'transparent',border:'none',color:'inherit'}}
                         value={mac.name}
                         onChange={e=>{
                           const updated = {...mac, name:e.target.value};
                           window.api.macroSave(updated).then(()=>{
                             window.api.macrosList().then(list=>set({macroLibrary:list}))
                           })
                         }}
                         onClick={e=>e.stopPropagation()} />
                </div>
                <button className="btn sm ghost danger" onClick={e=>deleteMacro(e, mac.id)}><Ico n="trash"/></button>
              </div>
            ))}
          </div>
          <button className="btn ghost" onClick={createMacro} style={{width:'100%'}}>{t('mc.new')}</button>
        </Panel>
      </div>

      {/* ── COL 2: Timeline ────────────────────────────── */}
      <div className="col" style={{flex:'1 1 0'}}>
        <Panel label={t('mc.events')} idx="02" right={m ? m.events.length+' '+t('mc.steps') : ''}>
          {!m ? (
            <div className="muted" style={{fontSize:'11px',padding:'16px 0',textAlign:'center'}}>{t('mc.select')}</div>
          ) : m.events.length===0 ? (
            <div className="muted" style={{fontSize:'11px',padding:'16px 0',textAlign:'center'}}>
              {recording ? t('mc.recordhint') : t('mc.noevents')}
            </div>
          ) : (
            <div className="macro-list">
              {m.events.map((ev,i)=>(
                <div key={i} className="macro-ev">
                  <span className="macro-idx">{String(i+1).padStart(2,'0')}</span>
                  <span className={'macro-type'+(ev.release?' up':' dn')}>{ev.release?t('mc.up'):t('mc.dn')}</span>
                  <select className="macro-delay" style={{width:'auto',flex:1}} value={ev.key} onChange={e=>setKey(i, e.target.value)}>
                    {Object.entries(HID_REV).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                  <input className="macro-delay" type="number" min="1" max="9999"
                    value={ev.delay} onChange={e=> setDelay(i,e.target.value)}/>
                  <span className="macro-ms">{t('mc.ms')}</span>
                  <button className="btn sm ghost danger macro-del" onClick={()=> removeEvent(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── COL 3: Settings & Record ─────────────────── */}
      <div className="col" style={{flex:'0 0 240px'}}>
        <Panel label={t('mc.settings')} idx="03">
          {m ? (
            <>
              <div className="row" style={{marginBottom:'12px'}}>
                <span className="k">{t('mc.mode')}</span>
                <Seg options={MACRO_MODES(t)} value={m.mode} onChange={v=> saveToLib({mode:v})}/>
              </div>
              {m.mode===0 && (
                <div className="row" style={{marginBottom:'12px'}}>
                  <span className="k">{t('mc.repeat')}</span>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <button className="btn sm" onClick={()=> saveToLib({repeat:Math.max(1,m.repeat-1)})}>−</button>
                    <span className="v" style={{minWidth:'32px',textAlign:'center',fontWeight:600}}>{m.repeat}</span>
                    <button className="btn sm" onClick={()=> saveToLib({repeat:Math.min(255,m.repeat+1)})}>+</button>
                  </div>
                </div>
              )}
              <div className="divider"></div>
              <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
                <button className={'btn'+(recording?' primary':'')} onClick={()=> setRecording(r=>!r)} style={{flex:1}}>
                  {recording ? t('mc.stop') : t('mc.record')}
                </button>
                <button className="btn ghost danger" onClick={clearAll} disabled={m.events.length===0}>{t('mc.clear')}</button>
              </div>
              <div className="tiny" style={{margin:'10px 0 8px'}}>{t('mc.quickadd')}</div>
              <div className="macro-mouse-grid">
                {MOUSE_BTNS.map(mb=>(
                  <button key={mb.code} className="btn sm" onClick={()=> addMouseClick(mb.code)}>
                    🖱 {mb.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="muted" style={{fontSize:'11px',textAlign:'center'}}>{t('mc.nomacro')}</div>
          )}
        </Panel>
      </div>
    </div>
  )
}

/* ===================== SETTINGS ===================== */
export function SettingsSection({ctx}){
  const {t, lang, setLang, accent, setAccent, theme, setTheme, customColor, setCustomColor} = ctx
  const reset = ()=>{ setLang('en'); setAccent('cyan'); setTheme('dark') }
  return (
    <div className="fade-in two-col">
      <div className="col">
        <Panel label={t('st.language')} idx="01" right={<span dangerouslySetInnerHTML={{__html:I.globe}} style={{width:14,height:14,display:'inline-block'}}/>}>
          <div className="tiny" style={{marginBottom:'10px'}}>{t('st.language.d')}</div>
          <div className="lang-grid">
            {LANGS.map(l=>(
              <button key={l.id} className={'lang-card'+(lang===l.id?' on':'')} onClick={()=>setLang(l.id)}>
                <span className="lang-tag">{l.tag}</span>
                <span className="lang-name">{l.label}</span>
                {lang===l.id && <span className="lang-check">●</span>}
              </button>
            ))}
          </div>
        </Panel>
        <Panel label={t('st.syscolor')} idx="02">
          <div className="tiny" style={{marginBottom:'12px'}}>{t('st.syscolor.d')}</div>
          <div className="accent-grid">
            {ACCENTS.map(a=>{
              const swColor = a.id==='custom' ? (customColor||'#ff6a00') : a.c
              return (
                <button key={a.id} className={'accent'+(accent===a.id?' on':'')} onClick={()=>setAccent(a.id)} title={a.name[lang]||a.name.en}>
                  <span className="accent-sw" style={{background:swColor,boxShadow:'0 0 10px '+swColor}}></span>
                  <span className="accent-nm">{a.name[lang]||a.name.en}</span>
                </button>
              )
            })}
          </div>
          {accent==='custom' && (
            <div className="row" style={{marginTop:'14px'}}>
              <span className="k">Custom color</span>
              <label className="btn sm" style={{cursor:'pointer'}}>
                <span style={{width:'13px',height:'13px',borderRadius:'4px',background:customColor,display:'inline-block'}}></span>{customColor.toUpperCase()}
                <input type="color" value={customColor} onChange={e=>setCustomColor(e.target.value)} style={{width:0,height:0,opacity:0,position:'absolute'}}/>
              </label>
            </div>
          )}
        </Panel>
      </div>
      <div className="col">
        <Panel label={t('st.appearance')} idx="03">
          <div className="row"><span className="k">{t('st.theme')}</span>
            <Seg live options={[{v:'dark',l:t('st.dark')},{v:'light',l:t('st.light')}]} value={theme} onChange={setTheme}/>
          </div>
        </Panel>
        <Panel label={t('st.about')} idx="04">
          <div className="stack" style={{gap:'9px'}}>
            <div className="row"><span className="k">{t('st.device')}</span><span className="v">Attack Shark X11</span></div>
            <div className="row"><span className="k">OpenSharkX11</span><span className="v">v{__APP_VERSION__}</span></div>
          </div>
          <div className="divider"></div>
          <button className="btn ghost danger" onClick={reset}><Ico n="reset"/>{t('st.reset')}</button>
        </Panel>
      </div>
    </div>
  )
}