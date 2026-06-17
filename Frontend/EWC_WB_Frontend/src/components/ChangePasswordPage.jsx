import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Eye, EyeOff, Save, CheckCircle2, AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { changeUserPassword } from '../graphql/UserServer';

function getPasswordChecks(p){return{minLength:p.length>=8,upper:/[A-Z]/.test(p),lower:/[a-z]/.test(p),number:/\d/.test(p),special:/[^A-Za-z0-9]/.test(p)};}
function getStrengthMeta(p){
  if(!p) return {score:0,label:'',barClass:'bg-muted',textClass:'text-muted-foreground'};
  const s=Object.values(getPasswordChecks(p)).filter(Boolean).length;
  if(s<=2) return {score:s,label:'Weak',barClass:'bg-[#C0392B]',textClass:'text-[#C0392B]'};
  if(s<=4) return {score:s,label:'Medium',barClass:'bg-[#B85C0D]',textClass:'text-[#B85C0D]'};
  return {score:s,label:'Strong',barClass:'bg-[#1D7D58]',textClass:'text-[#1D7D58]'};
}

function PasswordField({ label, value, show, onToggle, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-foreground mb-2">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"/>
        <input
          type={show?'text':'password'}
          value={value}
          onChange={e=>onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-11 py-3.5 rounded-2xl text-[14px] text-foreground glass-sm border-0 placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30 outline-none transition-spring"
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" aria-label={show?'Hide password':'Show password'}>
          {show ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
        </button>
      </div>
    </div>
  );
}

function Req({ passed, label }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${passed?'text-[#1D7D58]':'text-muted-foreground/40'}`}/>
      <span className={passed?'text-foreground':'text-muted-foreground'}>{label}</span>
    </div>
  );
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form,setForm]=useState({currentPassword:'',newPassword:'',confirmPassword:''});
  const [show,setShow]=useState({current:false,new:false,confirm:false});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  const checks=useMemo(()=>getPasswordChecks(form.newPassword),[form.newPassword]);
  const strength=useMemo(()=>getStrengthMeta(form.newPassword),[form.newPassword]);

  const onChange=k=>v=>setForm(p=>({...p,[k]:v}));
  const toggle=k=>()=>setShow(p=>({...p,[k]:!p[k]}));

  const validate=()=>{
    if(!form.currentPassword||!form.newPassword||!form.confirmPassword) return 'All fields are required.';
    if(form.newPassword.length<8) return 'New password must be at least 8 characters.';
    if(form.newPassword!==form.confirmPassword) return 'New passwords do not match.';
    if(form.currentPassword===form.newPassword) return 'New password must differ from current password.';
    return '';
  };

  const onSubmit=async(e)=>{
    e.preventDefault(); setError(''); setSuccess('');
    const v=validate(); if(v){setError(v);return;}
    if(!user?.id){setError('Session missing — please log in again.');return;}
    setLoading(true);
    try{
      await changeUserPassword({User_Id:user.id,Current_Password:form.currentPassword,New_Password:form.newPassword});
      setSuccess('Password changed successfully.');
      setForm({currentPassword:'',newPassword:'',confirmPassword:''});
      setTimeout(()=>navigate('/profile'),1400);
    }catch(err){setError(err?.message||'Failed to change password.');}
    finally{setLoading(false);}
  };

  return (
    <PageLayout maxWidth="max-w-lg">
      <button onClick={()=>navigate('/profile')} className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="w-4 h-4"/> Back to profile
      </button>

      <div className="mb-6 rounded-3xl glass-md p-6 animate-spring-in">
        <h1 className="text-[22px] font-semibold text-foreground leading-tight">Change password</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Choose a strong password you haven't used before.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-2xl text-[13px] mb-5">
          <AlertCircle className="w-4 h-4 flex-shrink-0"/>{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-[#E8F5EF] dark:bg-emerald-900/20 border border-[#9FE1CB] dark:border-emerald-800 text-[#085041] dark:text-emerald-300 px-4 py-3 rounded-2xl text-[13px] mb-5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0"/>{success}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="rounded-3xl glass-md px-5 py-5 space-y-4 mb-5">
          <PasswordField label="Current password" value={form.currentPassword} show={show.current} onToggle={toggle('current')} onChange={onChange('currentPassword')} placeholder="Enter current password"/>
          <PasswordField label="New password" value={form.newPassword} show={show.new} onToggle={toggle('new')} onChange={onChange('newPassword')} placeholder="Enter new password"/>

          {form.newPassword && (
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-muted-foreground">Password strength</span>
                <span className={strength.textClass}>{strength.label}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${strength.barClass}`} style={{ width:`${(strength.score/5)*100}%` }}/>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                <Req passed={checks.minLength} label="At least 8 characters"/>
                <Req passed={checks.upper}     label="One uppercase letter"/>
                <Req passed={checks.lower}     label="One lowercase letter"/>
                <Req passed={checks.number}    label="One number"/>
                <Req passed={checks.special}   label="One special character"/>
              </div>
            </div>
          )}

          <PasswordField label="Confirm new password" value={form.confirmPassword} show={show.confirm} onToggle={toggle('confirm')} onChange={onChange('confirmPassword')} placeholder="Re-enter new password"/>
        </div>

        <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2.5 bg-primary text-primary-foreground px-5 py-3.5 rounded-2xl text-[14px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-spring shadow-sm">
          <Save className="w-4 h-4"/>{loading?'Updating…':'Update password'}
        </button>
      </form>

      <div className="mt-5 rounded-3xl glass-sm p-4">
        <p className="text-[13px] font-semibold text-foreground mb-2 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/> Security tips</p>
        <ul className="space-y-1.5 text-[12px] text-muted-foreground list-disc pl-4">
          <li>Use a unique password not reused on other sites.</li>
          <li>Avoid personal details like name or birthday.</li>
          <li>Longer passphrases with symbols are stronger.</li>
        </ul>
      </div>
    </PageLayout>
  );
}