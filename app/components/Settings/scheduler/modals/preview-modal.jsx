import React, {Component, Fragment} from 'react';
import PropTypes from 'prop-types';
import {Controlled as CodeMirror} from 'react-codemirror2';
import ms from 'ms';
import cronstrue from 'cronstrue';

import Modal from '../../../modal';
import SuccessMessage from '../../../success';
import RequestError from '../presentational/request-error';
import TimedMessage from '../presentational/timed-message';
import Timestamp from '../presentational/timestamp.jsx';
import {Link} from '../../../Link.react';
import CronPicker from '../../cron-picker/cron-picker';
import {Row, Column} from '../../../layout';
import SQL from '../presentational/sql';
import Tag from '../presentational/tag';
import Status from '../presentational/status';
import TagPicker from '../pickers/tag-picker';
import TagModal from './tags-modal/tags-modal.jsx';
import {datasetUrl, decapitalize} from '../../../../utils/utils';
import {getHighlightMode, WAITING_MESSAGE, SAVE_WARNING, COLORS} from '../../../../constants/constants';
import {EXE_STATUS} from '../../../../../shared/constants.js';
import {getInitialCronMode} from '../../cron-picker/cron-helpers';
import ExecutionDetails from '../presentational/execution-details';
import {AdditionalCallsPreview, IndividualCallCount} from '../presentational/api-call-counts.jsx';
import {mapQueryToDailyCallCount} from '../../../../utils/queryUtils';

const NO_OP = () => {};

const flexStart = {justifyContent: 'flex-start'};
const rowStyle = {
    ...flexStart,
    borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
    padding: '12px 0px 24px'
};
const keyStyle = {boxSizing: 'border-box', width: '35%'};
const valueStyle = {boxSizing: 'border-box', width: '65%'};
const noMargin = {margin: 0};
const headingRowStyle = {
    ...flexStart,
    padding: '0 32px 16px',
    position: 'relative'
};

// implements a modal window to view details of a scheduled query
export class PreviewModal extends Component {
    static defaultProps = {
        onSave: NO_OP,
        onDelete: NO_OP,
        onLogin: NO_OP,
        onClickAway: NO_OP,
        openQueryPage: NO_OP,
        tags: [],
        totalCallsPerDay: 0
    };
    static propTypes = {
        query: PropTypes.object,
        onSave: PropTypes.func,
        onDelete: PropTypes.func,
        onLogin: PropTypes.func,
        openQueryPage: PropTypes.func,
        onClickAway: PropTypes.func,
        dialect: PropTypes.string,
        currentRequestor: PropTypes.string,
        tags: PropTypes.arrayOf(
            PropTypes.shape({
                name: PropTypes.string.isRequired,
                color: PropTypes.string
            })
        ),
        totalCallsPerDay: PropTypes.number.isRequired
    };
    constructor(props) {
        super(props);
        this.state = {
            successMessage: null,
            editing: false,
            code: props.query && props.query.query,
            cronInterval: props.query && props.query.cronInterval,
            name: props.query && props.query.name,
            confirmedDelete: false,
            loading: false,
            tags: (props.query && props.query.tags) || [],
            tagsModalOpen: false,
            confirmedRun: false
        };
        this.save = this.save.bind(this);
        this.updateCode = this.updateCode.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.onDelete = this.onDelete.bind(this);
        this.close = this.close.bind(this);
        this.renderButtonRow = this.renderButtonRow.bind(this);
        this.handleIntervalChange = this.handleIntervalChange.bind(this);
        this.handleNameChange = this.handleNameChange.bind(this);
        this.handleTagsChange = this.handleTagsChange.bind(this);
        this.handleRefresh = this.handleRefresh.bind(this);
        this.openTagsModal = this.openTagsModal.bind(this);
        this.closeTagsModal = this.closeTagsModal.bind(this);
    }

    updateCode(editor, meta, code) {
        this.setState({code});
    }

    handleIntervalChange(newInterval) {
        this.setState({cronInterval: newInterval});
    }

    handleNameChange(e) {
        this.setState({name: e.target.value});
    }

    handleTagsChange(tags) {
        this.setState({tags});
    }

    formatTags(tags) {
        if (tags.length === 0 || typeof tags[0] === 'string') {
            return tags;
        }

        return tags.map(tag => tag.id);
    }

    save() {
        const {connectionId, fid, requestor, uids} = this.props.query;
        const {code: query, cronInterval, tags} = this.state;
        const name = this.state.name ? this.state.name.trim() : '';

        this.setState({loading: true, error: null});
        return this.props
            .onSave({
                connectionId,
                fid,
                requestor,
                uids,
                query,
                name,
                cronInterval,
                tags: this.formatTags(tags)
            })
            .then(() => {
                this.setState({
                    loading: false,
                    editing: false,
                    confirmedDelete: false,
                    confirmedRun: false
                });
            });
    }

    handleRefresh() {
        if (this.state.confirmedRun) {
            if (!this.state.loading) {
                this.save()
                    .then(() =>
                        this.setState({
                            successMessage: 'Query ran successfully.'
                        })
                    )
                    .catch(error => this.setState({error: error.message, loading: false}));
            }
        } else {
            this.setState({confirmedRun: true});
        }
    }

    onSubmit() {
        if (this.state.editing) {
            this.save()
                .then(() =>
                    this.setState({
                        successMessage: 'Query saved successfully!'
                    })
                )
                .catch(error => this.setState({error: error.message, loading: false}));
        } else {
            this.setState({editing: true, confirmedDelete: false});
        }
    }

    onDelete() {
        if (this.state.confirmedDelete) {
            this.setState({confirmedDelete: false}, () => {
                this.props.onDelete(this.props.query.fid);
            });
        } else {
            this.setState({confirmedDelete: true});
        }
    }

    close() {
        this.setState({confirmedDelete: false, editing: false});
        this.props.onClickAway();
    }

    closeTagsModal() {
        this.setState({tagsModalOpen: false});
    }

    openTagsModal() {
        this.setState({tagsModalOpen: true});
    }

    renderButtonRow() {
        const {loading, editing} = this.state;

        const loggedIn = this.props.currentRequestor;
        const canEdit = this.props.currentRequestor && this.props.currentRequestor === this.props.query.requestor;
        const success = this.state.successMessage;

        if (this.props.query.lastExecution && this.props.query.lastExecution.status === EXE_STATUS.running) {
            return null;
        }

        if (!canEdit) {
            return (
                <React.Fragment>
                    {loggedIn ? (
                        <Column>
                            <Row>
                                <p style={{fontSize: 12, marginBottom: '16px', opacity: 0.7, width: '100%'}}>
                                    This query was created by another user. To modify, please log in as that user.
                                </p>
                            </Row>
                            <Row style={{justifyContent: 'flex-start'}}>
                                <button style={noMargin} onClick={this.props.onLogin}>
                                    {loggedIn ? 'Switch users' : 'Log in to edit query'}
                                </button>
                            </Row>
                        </Column>
                    ) : (
                        <button style={noMargin} onClick={this.props.onLogin}>
                            Log in to edit query
                        </button>
                    )}
                </React.Fragment>
            );
        }

        if (success) {
            return (
                <Column>
                    <SuccessMessage>{this.state.successMessage}</SuccessMessage>
                </Column>
            );
        }

        if (editing) {
            return (
                <Column>
                    <button style={noMargin} onClick={this.onSubmit}>
                        {loading ? 'Saving...' : 'Save'}
                    </button>
                    <div style={{fontSize: 12, margin: '16px 0px 0px', opacity: 0.7}}>{SAVE_WARNING}</div>
                </Column>
            );
        }

        return (
            <Fragment>
                <button style={noMargin} onClick={this.onSubmit}>
                    Edit
                </button>
                <button
                    style={{
                        margin: 0,
                        border: 'none',
                        background: COLORS.red
                    }}
                    onClick={this.onDelete}
                >
                    {this.state.confirmedDelete ? 'Click to confirm' : 'Delete'}
                </button>
            </Fragment>
        );
    }

    render() {
        const {query, totalCallsPerDay} = this.props;
        const callCount = mapQueryToDailyCallCount(query);
        const additionalCalls = mapQueryToDailyCallCount({cronInterval: this.state.cronInterval});

        let content;
        if (!query) {
            content = null;
        } else {
            if (this.state.tagsModalOpen) {
                return <TagModal onClickAway={this.closeTagsModal} />;
            }

            const link = datasetUrl(query.fid);
            const {editing, loading} = this.state;

            const initialModeId = getInitialCronMode(query);

            const run = query.lastExecution;
            const canEdit = this.props.currentRequestor && this.props.currentRequestor === query.requestor;

            content = (
                <Column
                    style={{
                        width: '60%',
                        maxHeight: '100vh',
                        minWidth: 640,
                        background: 'white',
                        paddingTop: 16,
                        position: 'relative'
                    }}
                >
                    <button
                        onClick={this.close}
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            padding: '2px 4px',
                            lineHeight: '14px',
                            minHeight: '16px',
                            zIndex: 99
                        }}
                    >
                        &times;
                    </button>
                    {editing && (
                        <Row
                            style={{
                                padding: '0 32px',
                                justifyContent: 'flex-start',
                                fontSize: 12,
                                margin: '8px 0',
                                fontWeight: 600,
                                opacity: 0.4,
                                letterSpacing: '0.5px'
                            }}
                        >
                            EDITING
                        </Row>
                    )}
                    <Row style={headingRowStyle}>
                        <Column style={{width: 'auto', marginRight: '32px', justifyContent: 'center'}}>
                            <Status size={40} status={run && run.status} />
                        </Column>
                        <Column style={{width: '84%'}}>
                            <Row className="sql-preview" style={flexStart}>
                                <h5 className="sql-preview ellipsis" style={{margin: '0', letterSpacing: '1px'}}>
                                    {this.state.name ? (
                                        <b>{this.state.name}</b>
                                    ) : (
                                        <SQL className="bold">{this.state.code}</SQL>
                                    )}
                                </h5>
                            </Row>
                            {this.state.tags && this.state.tags.length ? (
                                <Row style={{...flexStart, flexWrap: 'wrap', marginTop: 8}}>
                                    {this.state.tags.map(tag => (
                                        <Tag key={tag.name} style={{marginBottom: 8}} {...tag} />
                                    ))}
                                </Row>
                            ) : null}
                        </Column>
                    </Row>
                    <Column style={{background: '#F5F7FB', padding: '16px 32px'}}>
                        <Row style={rowStyle}>
                            <div style={keyStyle}>Query</div>
                            <div
                                className="sql-preview scheduler"
                                style={{...valueStyle, overflowY: 'auto', maxHeight: 300}}
                            >
                                {editing ? (
                                    <div style={{width: '99%'}}>
                                        <CodeMirror
                                            options={{
                                                lineNumbers: true,
                                                lineWrapping: true,
                                                tabSize: 4,
                                                readOnly: false,
                                                mode: getHighlightMode(this.props.dialect)
                                            }}
                                            value={this.state.code}
                                            onBeforeChange={this.updateCode}
                                        />
                                    </div>
                                ) : (
                                    <SQL className="default wrap">{this.state.code}</SQL>
                                )}
                            </div>
                        </Row>
                        {editing && (
                            <Row style={rowStyle}>
                                <div style={keyStyle}>Query Name</div>
                                <input
                                    maxLength="150"
                                    style={noMargin}
                                    placeholder="Enter query name here..."
                                    value={this.state.name}
                                    onChange={this.handleNameChange}
                                />
                            </Row>
                        )}
                        <Row style={rowStyle}>
                            <div style={keyStyle}>Schedule</div>
                            {editing ? (
                                <div style={{width: '65%', minHeight: '108px'}}>
                                    <CronPicker
                                        onChange={this.handleIntervalChange}
                                        initialModeId={initialModeId}
                                        initialCronExpression={this.state.cronInterval}
                                    />
                                    <AdditionalCallsPreview
                                        additionalCalls={additionalCalls}
                                        currTotal={totalCallsPerDay - callCount}
                                    />
                                </div>
                            ) : (
                                <div style={valueStyle}>
                                    {this.state.cronInterval
                                        ? `Runs ${decapitalize(cronstrue.toString(this.state.cronInterval))}`
                                        : `Runs every ${ms(query.refreshInterval * 1000, {
                                              long: true
                                          })}`}
                                    <br />
                                    <IndividualCallCount count={callCount} />
                                </div>
                            )}
                        </Row>
                        {editing && (
                            <Row style={rowStyle}>
                                <div style={keyStyle}>
                                    <div>Tags</div>
                                    <div onClick={this.openTagsModal}>
                                        <u className="tag-manager-text">manage tags</u>
                                    </div>
                                </div>
                                <div style={valueStyle}>
                                    <TagPicker
                                        disabled={Boolean(this.state.successMessage)}
                                        value={this.state.tags}
                                        options={this.props.tags}
                                        onChange={this.handleTagsChange}
                                    />
                                </div>
                            </Row>
                        )}
                        {!editing &&
                            run && (
                                <Row style={rowStyle}>
                                    <div style={keyStyle}>Last ran</div>
                                    <div style={valueStyle}>
                                        {run.status !== EXE_STATUS.running ? (
                                            <span
                                                style={{
                                                    color:
                                                        (run && run.status) !== EXE_STATUS.failed
                                                            ? '#00cc96'
                                                            : '#ef595b'
                                                }}
                                            >
                                                <Timestamp value={run.startedAt} checkIfRunning={false} />
                                            </span>
                                        ) : (
                                            <span style={{color: '#e4cf11'}}>Currently running</span>
                                        )}
                                        <br />
                                        {run.errorMessage && <span>{run.errorMessage}</span>}
                                        {run.duration && (
                                            <ExecutionDetails
                                                rowCount={run.rowCount}
                                                duration={run.duration}
                                                completedAt={run.completedAt}
                                            />
                                        )}
                                    </div>
                                </Row>
                            )}
                        {!editing && (
                            <Row style={rowStyle}>
                                <div style={keyStyle}>Scheduled to run</div>
                                <div style={valueStyle}>
                                    <Timestamp value={query.nextScheduledAt} checkIfRunning={true} />{' '}
                                    {canEdit && (
                                        <span style={{paddingLeft: '7px'}}>
                                            (
                                            <Link
                                                className="refresh-button"
                                                style={{color: '#506784'}}
                                                disabled={this.state.loading}
                                                onClick={this.handleRefresh}
                                            >
                                                {this.state.loading
                                                    ? 'saving...'
                                                    : this.state.confirmedRun
                                                        ? 'are you sure?'
                                                        : 'run now'}
                                            </Link>
                                            )
                                        </span>
                                    )}
                                </div>
                            </Row>
                        )}
                        {!editing && (
                            <Row style={rowStyle}>
                                <div style={keyStyle}>Live Dataset</div>
                                <Link href={link} style={valueStyle}>
                                    {link}
                                </Link>
                            </Row>
                        )}
                        {this.state.error && (
                            <Row style={rowStyle}>
                                <RequestError onClick={this.props.openQueryPage}>{this.state.error}</RequestError>
                            </Row>
                        )}
                        {loading && (
                            <Row style={{justifyContent: 'flex-start'}}>
                                <TimedMessage>
                                    <div style={{fontSize: 16, paddingTop: 16}}>{WAITING_MESSAGE}</div>
                                </TimedMessage>
                            </Row>
                        )}
                        <Row
                            style={{
                                ...rowStyle,
                                justifyContent: 'space-between',
                                border: 'none',
                                marginTop: 32,
                                paddingBottom: 16
                            }}
                        >
                            {this.renderButtonRow()}
                        </Row>
                    </Column>
                </Column>
            );
        }

        return (
            <Modal onClickAway={this.close} className="meta-preview" open={query !== null}>
                {content}
            </Modal>
        );
    }
}

export default PreviewModal;
