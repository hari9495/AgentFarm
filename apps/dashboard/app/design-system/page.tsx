'use client';

import { useState } from 'react';
import { Plus, Search, Bell, Check } from 'lucide-react';
import {
    Button, Badge, Input,
    Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
    Tabs, TabsList, TabsTrigger, TabsContent,
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
    Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
    Checkbox, Switch, Avatar, AvatarFallback,
    Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
    Popover, PopoverTrigger, PopoverContent,
    Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
    Label,
} from '@/components/ui';
import { WfThemeToggle } from '../components/editorial';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: 'var(--font-plex-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>{title}</div>
            {children}
        </section>
    );
}

const row: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' };

export default function DesignSystemGallery() {
    const [tab, setTab] = useState('overview');
    return (
        <TooltipProvider>
            <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-inter), sans-serif' }}>
                {/* Masthead */}
                <header style={{ borderBottom: '1px solid var(--border)', padding: '18px 32px 22px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ fontFamily: 'var(--font-plex-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: 'var(--muted-foreground)' }}>Design System — shadcn / ui × Ink &amp; Petrol</div>
                        <WfThemeToggle />
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontWeight: 600, fontSize: 40, letterSpacing: '-0.02em', margin: 0, lineHeight: 1 }}>Component Library</h1>
                    <p style={{ color: 'var(--muted-foreground)', fontSize: 14, marginTop: 8, maxWidth: '62ch', lineHeight: 1.6 }}>
                        Accessible Radix primitives (shadcn/ui), themed on the Ink &amp; Petrol token system. One accent, semantic status colours, sharp editorial corners. Every component below is production-ready and follows light / dark automatically.
                    </p>
                </header>

                <div style={{ padding: '32px', maxWidth: 980 }}>
                    <Section title="Buttons">
                        <div style={row}>
                            <Button><Plus className="size-4" /> Primary</Button>
                            <Button variant="secondary">Secondary</Button>
                            <Button variant="outline">Outline</Button>
                            <Button variant="ghost">Ghost</Button>
                            <Button variant="destructive">Destructive</Button>
                            <Button variant="link">Link</Button>
                            <Button size="sm">Small</Button>
                            <Button disabled>Disabled</Button>
                        </div>
                    </Section>

                    <Section title="Badges — semantic status">
                        <div style={row}>
                            <Badge>Default</Badge>
                            <Badge variant="ok"><Check className="size-3" /> Done</Badge>
                            <Badge variant="warn">Pending</Badge>
                            <Badge variant="danger">Failed</Badge>
                            <Badge variant="info">Live</Badge>
                            <Badge variant="secondary">Draft</Badge>
                            <Badge variant="outline">Archived</Badge>
                        </div>
                    </Section>

                    <Section title="Form controls">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 640 }}>
                            <div style={{ display: 'grid', gap: 8 }}>
                                <Label htmlFor="s">Search</Label>
                                <div style={{ position: 'relative' }}>
                                    <Search className="size-4" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                                    <Input id="s" placeholder="Search approvals…" style={{ paddingLeft: 32 }} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: 8 }}>
                                <Label>Workspace</Label>
                                <Select>
                                    <SelectTrigger><SelectValue placeholder="All workspaces" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="primary">Primary Dev</SelectItem>
                                        <SelectItem value="staging">Staging</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><Checkbox defaultChecked /> Auto-approve low risk</label>
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><Switch defaultChecked /> Max mode</label>
                            </div>
                        </div>
                    </Section>

                    <Section title="Tabs">
                        <Tabs value={tab} onValueChange={setTab}>
                            <TabsList>
                                <TabsTrigger value="overview">Overview</TabsTrigger>
                                <TabsTrigger value="approvals">Approvals</TabsTrigger>
                                <TabsTrigger value="audit">Audit</TabsTrigger>
                            </TabsList>
                            <TabsContent value="overview"><p style={{ fontSize: 14, color: 'var(--muted-foreground)', marginTop: 12 }}>Operational overview content.</p></TabsContent>
                            <TabsContent value="approvals"><p style={{ fontSize: 14, color: 'var(--muted-foreground)', marginTop: 12 }}>Pending approvals queue.</p></TabsContent>
                            <TabsContent value="audit"><p style={{ fontSize: 14, color: 'var(--muted-foreground)', marginTop: 12 }}>Audit ledger.</p></TabsContent>
                        </Tabs>
                    </Section>

                    <Section title="Card">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Acme Corp</CardTitle>
                                    <CardDescription>Enterprise · 12 agents</CardDescription>
                                </CardHeader>
                                <CardContent style={{ display: 'flex', gap: 8 }}>
                                    <Badge variant="ok">Healthy</Badge>
                                    <Badge variant="warn">1 pending</Badge>
                                </CardContent>
                                <CardFooter style={{ gap: 8 }}>
                                    <Button size="sm">Open</Button>
                                    <Button size="sm" variant="outline">Settings</Button>
                                </CardFooter>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Decision latency</CardTitle>
                                    <CardDescription>Last 24h</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: 34, fontWeight: 600, color: 'var(--primary)' }}>1.4s</div>
                                    <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>−18% vs. yesterday</p>
                                </CardContent>
                            </Card>
                        </div>
                    </Section>

                    <Section title="Table">
                        <Card>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Timestamp</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Requested by</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow><TableCell style={{ fontFamily: 'var(--font-plex-mono),monospace', color: 'var(--muted-foreground)' }}>18:04:12</TableCell><TableCell>connector_execute · jira</TableCell><TableCell>maya.r</TableCell><TableCell><Badge variant="ok">done</Badge></TableCell></TableRow>
                                    <TableRow><TableCell style={{ fontFamily: 'var(--font-plex-mono),monospace', color: 'var(--muted-foreground)' }}>18:03:47</TableCell><TableCell>approval_decision</TableCell><TableCell>system</TableCell><TableCell><Badge variant="warn">pending</Badge></TableCell></TableRow>
                                    <TableRow><TableCell style={{ fontFamily: 'var(--font-plex-mono),monospace', color: 'var(--muted-foreground)' }}>18:02:09</TableCell><TableCell>task_dispatch</TableCell><TableCell>ci.bot</TableCell><TableCell><Badge variant="danger">failed</Badge></TableCell></TableRow>
                                </TableBody>
                            </Table>
                        </Card>
                    </Section>

                    <Section title="Overlays & misc">
                        <div style={row}>
                            <Dialog>
                                <DialogTrigger asChild><Button variant="outline">Open dialog</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Approve action</DialogTitle>
                                        <DialogDescription>connector_execute · jira — create issue in PROJ. This runs immediately once approved.</DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                        <Button variant="outline">Cancel</Button>
                                        <Button>Approve</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                            <Popover>
                                <PopoverTrigger asChild><Button variant="outline"><Bell className="size-4" /> Notifications</Button></PopoverTrigger>
                                <PopoverContent><p style={{ fontSize: 13, margin: 0 }}>No new notifications.</p></PopoverContent>
                            </Popover>
                            <Tooltip>
                                <TooltipTrigger asChild><Button variant="ghost">Hover me</Button></TooltipTrigger>
                                <TooltipContent>Editorial tooltip</TooltipContent>
                            </Tooltip>
                            <Avatar><AvatarFallback>MR</AvatarFallback></Avatar>
                        </div>
                    </Section>
                </div>
            </div>
        </TooltipProvider>
    );
}
