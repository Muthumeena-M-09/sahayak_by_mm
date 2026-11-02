import React from 'react';
export class CentresErrorBoundary extends React.Component<{children:React.ReactNode;message:string;retryLabel:string;onBack:()=>void},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){console.error('Nearby help centres rendering failed:',error);}
 render(){return this.state.failed?<section role="alert" className="bg-card p-6 space-y-4"><p>{this.props.message}</p><button className="border-2 rounded-lg px-4" onClick={this.props.onBack}>{this.props.retryLabel}</button></section>:this.props.children;}
}
