(async function collectOperatorResult({waitThreads,readThread,threadId,hostId,afterCursor,timeoutMs=60000}) {
  if(!threadId || typeof waitThreads!=='function')throw Error('A ready threadId and waitThreads are required');
  const metrics={waitCalls:0,readCalls:0,sendCalls:0};
  let cursor=afterCursor;
  const unpack=value=>{
    if(value?.polls || value?.turns || value?.errors || value?.wake)return value;
    if(value?.isError)throw Error('Task tool returned an error');
    for(const c of value?.content??[]){
      if(c.type!=='text')continue;
      try {const parsed=JSON.parse(c.text);if(parsed && typeof parsed==='object')return parsed;} catch {}
    }
    throw Error('Unexpected task tool response');
  };
  const finish=(status,reason,extra={})=>({status,reason,threadId,hostId,cursor,metrics,...extra});
  const report=text=>{
    const status=/^(?:状态\s*[:：]\s*)?(DONE|BLOCKED|NEED_USER)\b/m.exec(text)?.[1];
    return finish(status??'BLOCKED',status?'operator_report':'terminal_report_missing_status',{result:text,terminal:true});
  };
  try {
    for(;;){
      metrics.waitCalls++;
      const state=unpack(await waitThreads({targets:[{threadId,...(hostId?{hostId}:{}),...(cursor?{afterCursor:cursor}:{})}],timeoutMs:Math.min(60000,Math.max(1,timeoutMs))}));
      if(state.errors?.length)return finish('BLOCKED','wait_error',{errors:state.errors});
      if(/user.*(?:input|message)|interrupt/i.test(state.wake?.reason??''))return finish('NEED_USER','controller_input_or_interrupt');
      const poll=state.polls?.find(p=>p.thread?.id===threadId)??state.polls?.[0];
      if(!poll)return finish('BLOCKED','missing_task_snapshot');
      if(poll.cursor)cursor=poll.cursor;
      const taskStatus=poll.thread?.status?.type;
      if(/approval|user.?input|needs.?attention|waiting.?on.?user/i.test(taskStatus??''))return finish('NEED_USER','task_needs_attention',{taskStatus});
      const turn=poll.latestTurn;
      if(['active','running'].includes(taskStatus) && turn?.status==='completed')continue;
      if(turn?.error || ['failed','interrupted','cancelled'].includes(turn?.status))return finish('BLOCKED','task_failed',{terminal:true,error:turn?.error??turn?.status});
      if(turn?.status==='completed'){
        let text=poll.latestAssistantMessage?.text;
        if(!text && readThread){
          metrics.readCalls++;
          const details=unpack(await readThread({threadId,hostId,turnLimit:1,includeOutputs:false,maxOutputCharsPerItem:20000}));
          const last=details.turns?.find(t=>t.id===turn.id);
          text=last?.items?.filter(i=>i.type==='agentMessage' && (!i.phase || i.phase==='final_answer')).at(-1)?.text;
        }
        return text?report(text):finish('BLOCKED','terminal_result_missing',{terminal:true});
      }
      if(turn?.status==='inProgress' || ['active','running'].includes(taskStatus))continue;
      return finish('BLOCKED','task_not_running_or_terminal',{taskStatus});
    }
  } catch(error){return finish('BLOCKED','collector_error',{error:String(error.message).slice(0,300)});}
})
