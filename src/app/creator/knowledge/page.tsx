"use client";
import { useState, useEffect, useRef } from "react";
import { Search, Globe, Type, RefreshCw, Trash2, X, Loader2, Check, Clock, AlertCircle, Upload, FileText, ExternalLink, Calendar, Database, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const statusCfg:Record<string,{label:string;color:string;icon:any}> = {
  INDEXED:{label:"Indexed",color:"bg-emerald-50 text-emerald-700",icon:Check},
  PROCESSING:{label:"Processing",color:"bg-amber-50 text-amber-700",icon:Clock},
  CRAWLING:{label:"Crawling",color:"bg-blue-50 text-blue-700",icon:Clock},
  PENDING:{label:"Pending",color:"bg-gray-50 text-gray-600",icon:Clock},
  ERROR:{label:"Error",color:"bg-red-50 text-red-700",icon:AlertCircle},
};

const typeCfg:Record<string,{label:string;color:string;icon:any}> = {
  URL:{label:"URL",color:"bg-blue-50 text-blue-700",icon:Globe},
  UPLOAD:{label:"Upload",color:"bg-violet-50 text-violet-700",icon:FileText},
  TEXT:{label:"Text",color:"bg-amber-50 text-amber-700",icon:Type},
};

export default function KnowledgePage() {
  const [sources,setSources]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [addMode,setAddMode]=useState<null|"url"|"text"|"website"|"upload">(null);
  const [url,setUrl]=useState(""); const [title,setTitle]=useState(""); const [text,setText]=useState("");
  const [ingesting,setIngesting]=useState(false); const [syncing,setSyncing]=useState(false);
  const [search,setSearch]=useState("");
  const [dragOver,setDragOver]=useState(false);
  const [uploadProgress,setUploadProgress]=useState<{name:string;status:string}[]>([]);
  const [selectedSource,setSelectedSource]=useState<any>(null);
  const fileInputRef=useRef<HTMLInputElement>(null);

  const load=()=>fetch("/api/knowledge/sources").then(r=>r.json()).then(d=>setSources(Array.isArray(d)?d:[])).finally(()=>setLoading(false));
  useEffect(()=>{load();},[]);

  const ingest=async(body:any)=>{
    setIngesting(true);
    try {
      const r=await fetch("/api/knowledge/ingest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await r.json();
      if(!r.ok) alert(`Ingestion failed: ${data.error||"Unknown error"}${data.blocked?"\n\nThis site may be blocking automated access.":""}`);
      await load();
    } catch(e:any){ alert(`Network error: ${e.message}`); }
    finally { setIngesting(false); setAddMode(null); setUrl(""); setTitle(""); setText(""); }
  };

  const uploadFiles=async(files:FileList|File[])=>{
    const allowed=["pdf","docx","pptx","txt","md"];
    const valid=Array.from(files).filter(f=>{
      const ext=f.name.split(".").pop()?.toLowerCase();
      return ext&&allowed.includes(ext)&&f.size<=10*1024*1024;
    });
    if(!valid.length){alert("No valid files. Supported: PDF, DOCX, PPTX, TXT, MD (max 10MB each).");return;}

    setUploadProgress(valid.map(f=>({name:f.name,status:"uploading"})));
    setIngesting(true);
    const fd=new FormData();
    valid.forEach(f=>fd.append("files",f));
    try {
      const r=await fetch("/api/knowledge/upload",{method:"POST",body:fd});
      const data=await r.json();
      if(data.results){
        setUploadProgress(data.results.map((r:any)=>({name:r.filename,status:r.error?`Error: ${r.error}`:"Done"})));
      }
      await load();
      setTimeout(()=>{setUploadProgress([]);setAddMode(null);},2000);
    } catch(e:any){ alert(`Upload failed: ${e.message}`); setUploadProgress([]); }
    finally { setIngesting(false); }
  };

  const handleDrop=(e:React.DragEvent)=>{ e.preventDefault();setDragOver(false);if(e.dataTransfer.files.length>0)uploadFiles(e.dataTransfer.files); };

  const deleteSrc=async(id:string)=>{
    await fetch("/api/knowledge/sources",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceId:id})});
    setSources(p=>p.filter(s=>s.id!==id));
  };

  const resync=async()=>{setSyncing(true); await fetch("/api/knowledge/resync",{method:"POST"}); await load(); setSyncing(false);};

  const filtered=sources.filter(s=>!search||s.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight" style={{fontFamily:"var(--font-display)"}}>Knowledge Base</h1>
        <p className="mt-1 text-sm text-muted-foreground">{sources.filter(s=>s.status==="INDEXED").length} indexed · {sources.reduce((a:number,s:any)=>a+(s.chunkCount||0),0)} chunks</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={()=>setAddMode("upload")} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30"><Upload className="h-3.5 w-3.5"/>Upload Files</button>
          <button onClick={()=>setAddMode("url")} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30"><Globe className="h-3.5 w-3.5"/>Add URL</button>
          <button onClick={()=>setAddMode("website")} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30"><Globe className="h-3.5 w-3.5"/>Crawl Site</button>
          <button onClick={()=>setAddMode("text")} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted/30"><Type className="h-3.5 w-3.5"/>Add Text</button>
          <button onClick={resync} disabled={syncing} className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-white hover:opacity-80 disabled:opacity-50"><RefreshCw className={cn("h-3.5 w-3.5",syncing&&"animate-spin")}/>{syncing?"Syncing…":"Resync"}</button>
        </div>
      </div>

      {/* Upload panel */}
      {addMode==="upload"&&(
        <div className={cn("rounded-xl border-2 border-dashed bg-white p-8 text-center transition-colors",dragOver?"border-foreground bg-muted/20":"border-border")}
          onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}>
          {uploadProgress.length>0?(
            <div className="space-y-2 text-left max-w-md mx-auto">
              {uploadProgress.map((p,i)=>(
                <div key={i} className="flex items-center gap-2 text-[13px]">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0"/>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className={cn("text-[11px] flex-shrink-0",p.status==="Done"?"text-emerald-600":p.status==="uploading"?"text-amber-600":"text-red-600")}>
                    {p.status==="uploading"?<Loader2 className="inline h-3 w-3 animate-spin"/>:p.status}
                  </span>
                </div>
              ))}
            </div>
          ):(
            <>
              <Upload className="mx-auto h-8 w-8 text-muted-foreground"/>
              <p className="mt-2 text-[13px] font-medium">Drag & drop files here</p>
              <p className="mt-1 text-[11px] text-muted-foreground">PDF, DOCX, PPTX, TXT, MD — max 10MB each</p>
              <button onClick={()=>fileInputRef.current?.click()} className="mt-3 rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-white hover:opacity-80">Browse files</button>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md" className="hidden"
                onChange={e=>e.target.files&&uploadFiles(e.target.files)}/>
            </>
          )}
          <button onClick={()=>{setAddMode(null);setUploadProgress([]);}} className="mt-3 block mx-auto text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}

      {/* URL panel */}
      {addMode==="url"&&(
        <div className="rounded-xl border border-border bg-white p-4 flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground"/>
          <input autoFocus value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://blog.example.com/article" className="flex-1 text-sm outline-none" onKeyDown={e=>e.key==="Enter"&&ingest({type:"url",url})}/>
          <button disabled={ingesting||!url.trim()} onClick={()=>ingest({type:"url",url})} className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-white disabled:opacity-50">{ingesting?<Loader2 className="h-3 w-3 animate-spin"/>:"Ingest"}</button>
          <button onClick={()=>setAddMode(null)}><X className="h-4 w-4 text-muted-foreground"/></button>
        </div>
      )}

      {/* Website crawl panel */}
      {addMode==="website"&&(
        <div className="rounded-xl border border-border bg-white p-4 space-y-2">
          <p className="text-[13px] text-muted-foreground">Enter your site URL. Echo will discover and crawl all pages.</p>
          <div className="flex items-center gap-2">
            <input autoFocus value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-blog.com" className="flex-1 h-9 rounded-md border border-border px-3 text-sm outline-none focus:border-foreground"/>
            <button disabled={ingesting||!url.trim()} onClick={()=>ingest({type:"website",url})} className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{ingesting?"Crawling…":"Crawl All Pages"}</button>
            <button onClick={()=>setAddMode(null)}><X className="h-4 w-4 text-muted-foreground"/></button>
          </div>
        </div>
      )}

      {/* Text panel */}
      {addMode==="text"&&(
        <div className="rounded-xl border border-border bg-white p-4 space-y-3">
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title" className="h-9 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-foreground"/>
          <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Paste content…" rows={4} className="w-full rounded-md border border-border p-3 text-sm outline-none resize-none focus:border-foreground"/>
          <div className="flex gap-2">
            <button disabled={ingesting||!title.trim()||!text.trim()} onClick={()=>ingest({type:"text",title,text})} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{ingesting?"Processing…":"Add"}</button>
            <button onClick={()=>setAddMode(null)} className="text-xs text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="h-9 w-full rounded-md border border-border pl-10 pr-4 text-sm outline-none focus:border-foreground"/></div>

      {/* Knowledge sources — card grid */}
      {loading?(
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground"/></div>
      ):filtered.length===0?(
        <div className="py-14 text-center text-sm text-muted-foreground">No sources yet. Upload files, add a URL, or paste text above.</div>
      ):(
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s:any)=>{
            const st=statusCfg[s.status]||statusCfg.PENDING;
            const tp=typeCfg[s.type]||typeCfg.TEXT;
            const TypeIcon=tp.icon;
            return(
              <div key={s.id} onClick={()=>setSelectedSource(s)} className="group cursor-pointer rounded-xl border border-border bg-white p-4 hover:shadow-md hover:border-border/80 transition-all duration-200">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                      <TypeIcon className="h-4 w-4 text-muted-foreground"/>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold truncate">{s.title}</p>
                      {s.fileName&&<p className="text-[11px] text-muted-foreground truncate">{s.fileName}</p>}
                      {s.sourceUrl&&!s.fileName&&<p className="text-[11px] text-muted-foreground truncate">{s.sourceUrl}</p>}
                    </div>
                  </div>
                  <button onClick={(e)=>{e.stopPropagation();deleteSrc(s.id);}} className="text-muted-foreground/40 hover:text-destructive flex-shrink-0 ml-2"><Trash2 className="h-3.5 w-3.5"/></button>
                </div>

                {/* Summary preview */}
                {s.summary&&(
                  <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">{s.summary}</p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",tp.color)}>{tp.label}</span>
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",st.color)}><st.icon className="h-2.5 w-2.5"/>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{s.chunkCount} chunks</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors"/>
                  </div>
                </div>
                {s.status==="ERROR"&&s.errorMsg&&(
                  <p className="mt-2 text-[11px] text-red-600 truncate" title={s.errorMsg}>{s.errorMsg}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selectedSource&&(()=>{
        const s=selectedSource;
        const st=statusCfg[s.status]||statusCfg.PENDING;
        const tp=typeCfg[s.type]||typeCfg.TEXT;
        const TypeIcon=tp.icon;
        return(
          <div className="fixed inset-0 z-50 flex items-center justify-end" onClick={()=>setSelectedSource(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"/>
            <div className="relative h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl" onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-6 py-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                    <TypeIcon className="h-5 w-5 text-muted-foreground"/>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold truncate">{s.title}</h2>
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium mt-0.5",tp.color)}>{tp.label}</span>
                  </div>
                </div>
                <button onClick={()=>setSelectedSource(null)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><X className="h-4 w-4"/></button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Status & Stats */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium",st.color)}><st.icon className="h-3.5 w-3.5"/>{st.label}</span>
                  {s.chunkCount>0&&(
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[12px] text-muted-foreground"><Database className="h-3.5 w-3.5"/>{s.chunkCount} chunks</span>
                  )}
                  {s.createdAt&&(
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[12px] text-muted-foreground"><Calendar className="h-3.5 w-3.5"/>{new Date(s.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
                  )}
                </div>

                {/* Source URL or filename */}
                {s.sourceUrl&&(
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Source URL</p>
                    <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:underline break-all">
                      {s.sourceUrl}<ExternalLink className="h-3 w-3 flex-shrink-0"/>
                    </a>
                  </div>
                )}
                {s.fileName&&(
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Filename</p>
                    <p className="text-[13px] text-foreground">{s.fileName}</p>
                  </div>
                )}

                {/* Summary */}
                {s.summary&&(
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Summary</p>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">{s.summary}</p>
                  </div>
                )}

                {/* Error message */}
                {s.status==="ERROR"&&s.errorMsg&&(
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="mb-1 text-[11px] font-medium text-red-800">Error</p>
                    <p className="text-[12px] text-red-700">{s.errorMsg}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <button onClick={()=>{deleteSrc(s.id);setSelectedSource(null);}} className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-3 text-[12px] font-medium text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5"/>Delete source
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
