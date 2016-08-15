// Copyright (c) 2016 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import Client from 'client/web_client.jsx';
import WebSocketClient from 'client/web_websocket_client.jsx';

import UserStore from 'stores/user_store.jsx';
import WebrtcStore from 'stores/webrtc_store.jsx';

import * as WebrtcActions from 'actions/webrtc_actions.jsx';
import * as Utils from 'utils/utils.jsx';
import {WebrtcActionTypes} from 'utils/constants.jsx';

import React from 'react';

import {FormattedMessage} from 'react-intl';

import ring from 'images/ring.mp3';

export default class WebrtcNotification extends React.Component {
    constructor() {
        super();

        this.mounted = false;

        this.closeNotification = this.closeNotification.bind(this);
        this.onIncomingCall = this.onIncomingCall.bind(this);
        this.onCancelCall = this.onCancelCall.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleAnswer = this.handleAnswer.bind(this);
        this.handleTimeout = this.handleTimeout.bind(this);

        this.state = {
            userCalling: null
        };
    }

    componentDidMount() {
        WebrtcStore.addNotifyListener(this.onIncomingCall);
        WebrtcStore.addChangedListener(this.onCancelCall);
        this.mounted = true;
    }

    componentWillUnmount() {
        WebrtcStore.removeNotifyListener(this.onIncomingCall);
        WebrtcStore.removeChangedListener(this.onCancelCall);
        if (this.refs.ring) {
            this.refs.ring.removeListener('ended', this.handleTimeout);
        }
        this.mounted = false;
    }

    componentDidUpdate() {
        if (this.state.userCalling) {
            this.refs.ring.addEventListener('ended', this.handleTimeout);
        }
    }

    closeNotification() {
        this.setState({
            userCalling: null
        });
    }

    onIncomingCall(incoming) {
        if (this.mounted) {
            const userId = incoming.from_user_id;
            const userMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

            if (WebrtcStore.isBusy()) {
                WebSocketClient.sendMessage('webrtc', {
                    action: WebrtcActionTypes.BUSY,
                    from_user_id: UserStore.getCurrentId(),
                    to_user_id: userId
                });
            } else if (userMedia) {
                WebrtcStore.setVideoCallWith(userId);
                this.setState({
                    userCalling: UserStore.getProfile(userId)
                });
            } else {
                WebSocketClient.sendMessage('webrtc', {
                    action: WebrtcActionTypes.UNSUPPORTED,
                    from_user_id: UserStore.getCurrentId(),
                    to_user_id: userId
                });
            }
        }
    }

    onCancelCall(message) {
        if (message && message.action !== WebrtcActionTypes.CANCEL) {
            return;
        } else if (message && message.action === WebrtcActionTypes.CANCEL && this.state.userCalling && message.from_user_id !== this.state.userCalling.id) {
            return;
        }

        WebrtcStore.setVideoCallWith(null);
        this.closeNotification();
    }

    handleTimeout() {
        WebSocketClient.sendMessage('webrtc', {
            action: WebrtcActionTypes.NO_ANSWER,
            from_user_id: UserStore.getCurrentId(),
            to_user_id: this.state.userCalling.id
        });

        this.onCancelCall();
    }

    handleAnswer(e) {
        if (e) {
            e.preventDefault();
        }

        const caller = this.state.userCalling;
        if (caller) {
            const callerId = caller.id;
            const currentUserId = UserStore.getCurrentId();
            const message = {
                action: WebrtcActionTypes.ANSWER,
                from_user_id: currentUserId,
                to_user_id: callerId
            };

            WebrtcActions.initWebrtc(callerId, false);
            WebSocketClient.sendMessage('webrtc', message);

            // delay till next tick (this will give time to listen for events
            setTimeout(() => {
                //we switch from and to user to handle the event locally
                message.from_user_id = callerId;
                message.to_user_id = currentUserId;
                WebrtcActions.handle(message);
            }, 0);

            this.closeNotification();
        }
    }

    handleClose(e) {
        if (e) {
            e.preventDefault();
        }
        if (this.state.userCalling) {
            WebSocketClient.sendMessage('webrtc', {
                action: WebrtcActionTypes.DECLINE,
                from_user_id: UserStore.getCurrentId(),
                to_user_id: this.state.userCalling.id
            });
        }

        this.onCancelCall();
    }

    render() {
        const user = this.state.userCalling;
        if (user) {
            const username = Utils.displayUsername(user.id);
            const profileImgSrc = Client.getUsersRoute() + '/' + user.id + '/image?time=' + (user.update_at || new Date().getTime());
            const profileImg = (
                <img
                    className='user-popover__image'
                    src={profileImgSrc}
                    height='128'
                    width='128'
                    key='user-popover-image'
                />
            );
            const answerBtn = (
                <svg
                    className='webrtc-icons__call'
                    xmlns='http://www.w3.org/2000/svg'
                    width='48'
                    height='48'
                    viewBox='-10 -10 68 68'
                    onClick={this.handleAnswer}
                >
                    <circle
                        cx='24'
                        cy='24'
                        r='34'
                    >
                        <title>
                            <FormattedMessage
                                id='webrtc.notification.answer'
                                defaultMessage='Answer'
                            />
                        </title>
                    </circle>
                    <path
                        transform='scale(0.8), translate(65,20), rotate(120)'
                        d='M24 18c-3.21 0-6.3.5-9.2 1.44v6.21c0 .79-.46 1.47-1.12 1.8-1.95.98-3.74 2.23-5.33 3.7-.36.35-.85.57-1.4.57-.55 0-1.05-.22-1.41-.59L.59 26.18c-.37-.37-.59-.87-.59-1.42 0-.55.22-1.05.59-1.42C6.68 17.55 14.93 14 24 14s17.32 3.55 23.41 9.34c.37.36.59.87.59 1.42 0 .55-.22 1.05-.59 1.41l-4.95 4.95c-.36.36-.86.59-1.41.59-.54 0-1.04-.22-1.4-.57-1.59-1.47-3.38-2.72-5.33-3.7-.66-.33-1.12-1.01-1.12-1.8v-6.21C30.3 18.5 27.21 18 24 18z'
                        fill='white'
                    />
                </svg>
            );

            const rejectBtn = (
                <svg
                    className='webrtc-icons__cancel'
                    xmlns='http://www.w3.org/2000/svg'
                    width='48'
                    height='48'
                    viewBox='-10 -10 68 68'
                    onClick={this.handleClose}
                >
                    <circle
                        cx='24'
                        cy='24'
                        r='34'
                    >
                        <title>
                            <FormattedMessage
                                id='webrtc.notification.decline'
                                defaultMessage='Decline'
                            />
                        </title>
                    </circle>
                    <path
                        transform='scale(0.7), translate(11,10)'
                        d='M24 18c-3.21 0-6.3.5-9.2 1.44v6.21c0 .79-.46 1.47-1.12 1.8-1.95.98-3.74 2.23-5.33 3.7-.36.35-.85.57-1.4.57-.55 0-1.05-.22-1.41-.59L.59 26.18c-.37-.37-.59-.87-.59-1.42 0-.55.22-1.05.59-1.42C6.68 17.55 14.93 14 24 14s17.32 3.55 23.41 9.34c.37.36.59.87.59 1.42 0 .55-.22 1.05-.59 1.41l-4.95 4.95c-.36.36-.86.59-1.41.59-.54 0-1.04-.22-1.4-.57-1.59-1.47-3.38-2.72-5.33-3.7-.66-.33-1.12-1.01-1.12-1.8v-6.21C30.3 18.5 27.21 18 24 18z'
                        fill='white'
                    />
                </svg>
            );

            const msg = (
                <div>
                    <FormattedMessage
                        id='webrtc.notification.incoming_call'
                        defaultMessage='{username} is calling you.'
                        values={{
                            username
                        }}
                    />
                    <div
                        className='webrtc-buttons webrtc-icons active'
                        style={{marginTop: '5px'}}
                    >
                        {answerBtn}
                        {rejectBtn}
                    </div>
                </div>
            );

            return (
                <div className='webrtc-notification'>
                    <audio
                        ref='ring'
                        src={ring}
                        autoPlay={true}
                    />
                    <div>
                        {profileImg}
                    </div>
                    {msg}
                </div>
            );
        }

        return <div/>;
    }
}
